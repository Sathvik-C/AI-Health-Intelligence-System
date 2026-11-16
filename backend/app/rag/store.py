"""Vector store over the kb_chunks table.

Backends
  pgvector – PostgreSQL + pgvector extension: vectors live in `embedding_vec vector(N)` with an HNSW
             cosine index, and similarity search runs inside the database.
  numpy    – any database (SQLite, plain Postgres): vectors are float32 bytes in `embedding`; search loads
             the matrix once (cached) and does a dot product. Fast enough for tens of thousands of chunks.

`auto` (default) picks pgvector when available and falls back to numpy, so the app never breaks because
the extension is missing.
"""
from __future__ import annotations

import logging
import threading
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
from sqlalchemy import func, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.models.models import KBChunk
from app.rag import config
from app.rag.vocab import tag_index

log = logging.getLogger("rag.store")


def to_bytes(v: np.ndarray) -> bytes:
    return np.asarray(v, dtype=np.float32).tobytes()


def from_bytes(b: bytes) -> np.ndarray:
    return np.frombuffer(b, dtype=np.float32)


def _vec_literal(v: np.ndarray) -> str:
    return "[" + ",".join(f"{x:.7f}" for x in np.asarray(v, dtype=np.float32)) + "]"


class VectorStore:
    def __init__(self, engine: Engine, dim: int = None, backend: str = None):
        self.engine = engine
        self.dim = dim or config.EMBED_DIM
        self.requested = (backend or config.VECTOR_BACKEND).lower()
        self.backend = "numpy"
        self.backend_note = ""
        self._cache_key = None
        self._cache: Tuple[List[str], Optional[np.ndarray]] = ([], None)
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ schema
    def ensure_schema(self, migrate: bool = False) -> "VectorStore":
        """Create/verify the table. If the pgvector column has a different size than the current embedding
        model (e.g. after switching from Gemini 768-d to the local 384-d model):
          migrate=True  (ingest build) – drop and recreate the vector column; vectors are rebuilt from text;
          migrate=False (web app)      – keep serving with the numpy backend until `ingest build` runs."""
        KBChunk.__table__.create(self.engine, checkfirst=True)
        if self.requested == "numpy":
            self.backend, self.backend_note = "numpy", "forced by RAG_VECTOR_BACKEND=numpy"
            return self
        if self.engine.dialect.name != "postgresql":
            if self.requested == "pgvector":
                raise RuntimeError("RAG_VECTOR_BACKEND=pgvector needs a PostgreSQL database")
            self.backend, self.backend_note = "numpy", f"{self.engine.dialect.name} database"
            return self
        try:
            with self.engine.begin() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                existing = conn.execute(text(
                    "SELECT atttypmod FROM pg_attribute WHERE attrelid = 'kb_chunks'::regclass "
                    "AND attname = 'embedding_vec' AND NOT attisdropped")).scalar()
                if existing not in (None, -1, self.dim):
                    if not migrate:
                        self.backend = "numpy"
                        self.backend_note = (f"vector column has {existing} dimensions, model needs {self.dim}; "
                                             "run `python -m app.rag.ingest build` to rebuild")
                        log.warning("RAG vector store: %s", self.backend_note)
                        return self
                    conn.execute(text("DROP INDEX IF EXISTS kb_chunks_embedding_hnsw"))
                    conn.execute(text("ALTER TABLE kb_chunks DROP COLUMN embedding_vec"))
                    log.warning("RAG vector store: rebuilt vector column %s -> %s dimensions", existing, self.dim)
                conn.execute(text(f"ALTER TABLE kb_chunks ADD COLUMN IF NOT EXISTS embedding_vec vector({self.dim})"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS kb_chunks_embedding_hnsw ON kb_chunks "
                                  "USING hnsw (embedding_vec vector_cosine_ops)"))
            self.backend, self.backend_note = "pgvector", "PostgreSQL + pgvector (HNSW, cosine)"
        except Exception as e:  # extension not installed in this Postgres image
            if self.requested == "pgvector":
                raise
            self.backend = "numpy"
            self.backend_note = f"pgvector unavailable ({str(e).splitlines()[0][:120]}); using numpy"
            log.warning("RAG vector store: %s", self.backend_note)
        return self

    # ------------------------------------------------------------------ writes
    def upsert_chunks(self, db: Session, chunks: Sequence[Dict]) -> Dict[str, int]:
        """Insert new chunks, update changed ones (clearing their embedding), leave identical ones alone."""
        ids = [c["id"] for c in chunks]
        existing = {r.id: r for r in db.query(KBChunk).filter(KBChunk.id.in_(ids)).all()} if ids else {}
        counts = {"new": 0, "changed": 0, "unchanged": 0}
        for c in chunks:
            row = existing.get(c["id"])
            if row is not None and row.content_hash == c["content_hash"]:
                counts["unchanged"] += 1
                continue
            if row is None:
                row = KBChunk(id=c["id"])
                db.add(row)
                counts["new"] += 1
            else:
                counts["changed"] += 1
                row.embedding, row.embed_model = None, None
                if self.backend == "pgvector":
                    db.execute(text("UPDATE kb_chunks SET embedding_vec = NULL WHERE id = :id"), {"id": row.id})
            for k in ("source", "doc_id", "title", "section", "url", "text", "tags", "licence", "version", "content_hash"):
                setattr(row, k, c.get(k))
            row.tag_index = tag_index(c.get("tags") or {})
        db.commit()
        return counts

    def delete_except(self, db: Session, source: str, keep_ids: Iterable[str]) -> int:
        keep = set(keep_ids)
        stale = [r.id for r in db.query(KBChunk.id).filter(KBChunk.source == source).all() if r.id not in keep]
        for i in range(0, len(stale), 500):
            db.query(KBChunk).filter(KBChunk.id.in_(stale[i:i + 500])).delete(synchronize_session=False)
        db.commit()
        return len(stale)

    def pending(self, db: Session, model_id: str, limit: Optional[int] = None) -> List[KBChunk]:
        q = db.query(KBChunk).filter((KBChunk.embedding.is_(None)) | (KBChunk.embed_model != model_id)) \
            .order_by(KBChunk.source, KBChunk.id)
        return q.limit(limit).all() if limit else q.all()

    def set_embeddings(self, db: Session, rows: Sequence[KBChunk], vecs: Sequence[np.ndarray], model_id: str):
        for row, v in zip(rows, vecs):
            row.embedding = to_bytes(v)
            row.embed_model = model_id
            if self.backend == "pgvector":
                db.execute(text("UPDATE kb_chunks SET embedding_vec = CAST(:v AS vector) WHERE id = :id"),
                           {"v": _vec_literal(v), "id": row.id})
        db.commit()

    def reset(self, db: Session, source: Optional[str] = None) -> int:
        q = db.query(KBChunk)
        if source:
            q = q.filter(KBChunk.source == source)
        n = q.delete(synchronize_session=False)
        db.commit()
        return n

    # ------------------------------------------------------------------ reads
    def _matrix(self, db: Session, model_id: str) -> Tuple[List[str], Optional[np.ndarray]]:
        key = db.query(func.count(KBChunk.id), func.max(KBChunk.updated_at)) \
            .filter(KBChunk.embed_model == model_id).one()
        key = (key[0], str(key[1]), model_id)
        with self._lock:
            if key != self._cache_key:
                rows = db.query(KBChunk.id, KBChunk.embedding).filter(KBChunk.embed_model == model_id,
                                                                       KBChunk.embedding.isnot(None)).all()
                ids = [r.id for r in rows]
                mat = np.vstack([from_bytes(r.embedding) for r in rows]) if rows else None
                self._cache_key, self._cache = key, (ids, mat)
            return self._cache

    def search(self, db: Session, qvec: np.ndarray, n: int, model_id: str) -> List[Tuple[str, float]]:
        if self.backend == "pgvector":
            rows = db.execute(text(
                "SELECT id, 1 - (embedding_vec <=> CAST(:q AS vector)) AS score FROM kb_chunks "
                "WHERE embedding_vec IS NOT NULL AND embed_model = :m "
                "ORDER BY embedding_vec <=> CAST(:q AS vector) LIMIT :n"),
                {"q": _vec_literal(qvec), "m": model_id, "n": n}).all()
            return [(r[0], float(r[1])) for r in rows]
        ids, mat = self._matrix(db, model_id)
        if mat is None:
            return []
        scores = mat @ np.asarray(qvec, dtype=np.float32)
        top = np.argsort(-scores)[:n]
        return [(ids[i], float(scores[i])) for i in top]

    def count_embedded(self, db: Session, model_id: str) -> int:
        return db.query(func.count(KBChunk.id)).filter(KBChunk.embed_model == model_id,
                                                        KBChunk.embedding.isnot(None)).scalar() or 0

    def similarity(self, rows: Sequence[KBChunk], qvec: np.ndarray, model_id: str) -> Dict[str, float]:
        q = np.asarray(qvec, dtype=np.float32)
        return {r.id: float(from_bytes(r.embedding) @ q) for r in rows
                if r.embedding is not None and r.embed_model == model_id}

    def stats(self, db: Session) -> Dict:
        by_source = {}
        for src, total, embedded in db.query(KBChunk.source, func.count(KBChunk.id), func.count(KBChunk.embedding)) \
                .group_by(KBChunk.source).all():
            by_source[src] = {"chunks": total, "embedded": embedded}
        total = sum(v["chunks"] for v in by_source.values())
        embedded = sum(v["embedded"] for v in by_source.values())
        text_bytes = db.query(func.coalesce(func.sum(func.length(KBChunk.text)), 0)).scalar() or 0
        vector_bytes = embedded * self.dim * 4
        return {
            "backend": self.backend, "backend_note": self.backend_note, "dimensions": self.dim,
            "chunks": total, "embedded": embedded, "pending": total - embedded, "by_source": by_source,
            "approx_text_mb": round(text_bytes / 1e6, 2),
            "approx_vector_mb": round(vector_bytes / 1e6 * (2 if self.backend == "pgvector" else 1), 2),
            "models": [m for (m,) in db.query(KBChunk.embed_model).filter(KBChunk.embed_model.isnot(None)).distinct()],
        }


_store: Optional[VectorStore] = None
_store_lock = threading.Lock()


def get_store(engine: Engine = None) -> VectorStore:
    """Process-wide store (schema checked once)."""
    global _store
    with _store_lock:
        if _store is None or (engine is not None and _store.engine is not engine):
            if engine is None:
                from app.database import engine as default_engine
                engine = default_engine
            _store = VectorStore(engine).ensure_schema()
        return _store
