"""Hybrid retrieval: vector similarity + drug/gene tag match + keyword overlap.

Why hybrid: drug and gene names are exact strings ("clopidogrel", "CYP2C19"); pure vector search can rank a
similar-sounding passage about a different drug higher. Tags pull in the exact drug's passages and boost them.
If the embedding call fails (no key, quota used up), retrieval falls back to tags + keywords so the chat
still works — the response says which mode was used.
"""
from __future__ import annotations

import re
import threading
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Set, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.models import KBChunk
from app.rag import config
from app.rag.embeddings import default_embedder
from app.rag.store import get_store
from app.rag.vocab import extract_entities, register_drugs

_STOP = set("""a an and are as at be been but by can could did do does doing for from had has have how i if in into is
it its me my of on or our should so than that the their them then there these they this to was we what when where
which who why will with would you your about after again all also am any because before being below between both
during each few further here just more most much must no nor not now only other over own same some such too under
until very while""".split())
_WORD = re.compile(r"[a-z][a-z0-9\-]{2,}")


def terms(text: str) -> Set[str]:
    return {w for w in _WORD.findall((text or "").lower()) if w not in _STOP}


@dataclass
class Hit:
    chunk: KBChunk
    score: float
    vector: Optional[float]
    entity: float
    keyword: float


_query_embedder = None
_vocab_key = None
_lock = threading.Lock()


def _embedder():
    global _query_embedder
    with _lock:
        if _query_embedder is None:
            _query_embedder = default_embedder()
        return _query_embedder


def set_query_embedder(e) -> None:
    """Tests / evaluation can inject an embedder."""
    global _query_embedder
    _query_embedder = e


def _refresh_vocab(db: Session) -> None:
    """Teach the entity extractor every drug name present in the knowledge base (cached by row count)."""
    global _vocab_key
    n = db.query(func.count(KBChunk.id)).scalar() or 0
    if n == _vocab_key:
        return
    names = set()
    for (ti,) in db.query(KBChunk.tag_index).filter(KBChunk.tag_index.like("%|drug:%")).all():
        names |= {p[5:] for p in (ti or "").split("|") if p.startswith("drug:")}
    register_drugs(names)
    _vocab_key = n


def _entity_rows(db: Session, entities: Dict[str, Iterable[str]], limit: int = 200) -> List[KBChunk]:
    conds = [KBChunk.tag_index.like(f"%|drug:{d.lower()}|%") for d in entities.get("drugs", [])]
    conds += [KBChunk.tag_index.like(f"%|gene:{g.lower().split('*')[0]}|%") for g in entities.get("genes", [])]
    if not conds:
        return []
    return db.query(KBChunk).filter(or_(*conds)).limit(limit).all()


def _entity_score(row: KBChunk, entities: Dict[str, Iterable[str]]) -> float:
    tags = row.tags or {}
    drugs = {d.lower() for d in tags.get("drugs") or []}
    mentioned = {d.lower() for d in tags.get("mentioned_drugs") or []}
    genes = {str(g).upper().split("*")[0] for g in tags.get("genes") or []}
    q_drugs = {d.lower() for d in entities.get("drugs", [])}
    q_genes = {g.upper().split("*")[0] for g in entities.get("genes", [])}
    drug_m = 1.0 if q_drugs & drugs else (0.4 if q_drugs & mentioned else 0.0)
    gene_m = 1.0 if q_genes & genes else 0.0
    if q_drugs and q_genes:
        return (drug_m + gene_m) / 2
    return drug_m if q_drugs else gene_m


def retrieve(db: Session, question: str, extra_entities: Optional[Dict[str, Iterable[str]]] = None,
             k: int = None, embedder=None) -> Tuple[List[Hit], Dict]:
    k = k or config.TOP_K
    store = get_store(db.get_bind())
    total = db.query(func.count(KBChunk.id)).scalar() or 0
    info: Dict = {"kb_chunks": total, "backend": store.backend, "mode": "none", "entities": {}}
    if total == 0:
        info["note"] = "knowledge base is empty — run python -m app.rag.ingest"
        return [], info

    _refresh_vocab(db)
    ents = extract_entities(question)
    for kind in ("drugs", "genes"):
        ents[kind] = sorted(set(ents.get(kind, [])) | set((extra_entities or {}).get(kind, [])))
    info["entities"] = ents

    embedder = embedder or _embedder()
    qvec, model_id = None, embedder.model_id
    if store.count_embedded(db, model_id) == 0:
        info["mode"] = "keyword"
        info["note"] = (f"library not embedded with {model_id} yet — run python -m app.rag.ingest build; "
                        "used tag + keyword search")
    else:
        try:
            qvec = embedder.embed_query(question)
            info["mode"] = "hybrid"
        except Exception as e:
            info["mode"] = "keyword"
            info["note"] = f"embedding unavailable ({type(e).__name__}); used tag + keyword search"

    cands: Dict[str, KBChunk] = {}
    vec_scores: Dict[str, float] = {}
    if qvec is not None:
        for cid, s in store.search(db, qvec, config.VECTOR_CANDIDATES, model_id):
            vec_scores[cid] = s
        if vec_scores:
            for row in db.query(KBChunk).filter(KBChunk.id.in_(list(vec_scores))).all():
                cands[row.id] = row
    for row in _entity_rows(db, ents):
        cands.setdefault(row.id, row)
    if qvec is not None:
        missing = [r for cid, r in cands.items() if cid not in vec_scores]
        vec_scores.update(store.similarity(missing, qvec, model_id))
    if qvec is None and not cands:
        q_terms = terms(question)
        if q_terms:
            like = [KBChunk.text.ilike(f"%{t}%") for t in sorted(q_terms, key=len, reverse=True)[:6]]
            for row in db.query(KBChunk).filter(or_(*like)).limit(400).all():
                cands[row.id] = row

    q_terms = terms(question)
    hits: List[Hit] = []
    for cid, row in cands.items():
        em = _entity_score(row, ents)
        kw = (len(q_terms & terms(f"{row.title} {row.section} {row.text}")) / len(q_terms)) if q_terms else 0.0
        if qvec is not None:
            v = vec_scores.get(cid)
            if v is None:
                continue
            if v < config.MIN_SCORE and em == 0:
                continue
            score = v + config.ENTITY_BOOST * em + config.KEYWORD_BOOST * kw
        else:
            v = None
            if em == 0 and kw < 0.3:
                continue
            score = 0.5 * em + kw
        hits.append(Hit(row, score, v, em, kw))

    hits.sort(key=lambda h: h.score, reverse=True)
    per_doc: Dict[str, int] = {}
    out: List[Hit] = []
    for h in hits:
        n = per_doc.get(h.chunk.doc_id, 0)
        if n >= config.MAX_CHUNKS_PER_DOC:
            continue
        per_doc[h.chunk.doc_id] = n + 1
        out.append(h)
        if len(out) >= k:
            break
    return out, info
