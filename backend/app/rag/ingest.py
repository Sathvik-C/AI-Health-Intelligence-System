"""Build the RAG knowledge base.

Run inside the backend container (it has internet access and the database):

  docker-compose exec backend python -m app.rag.ingest fetch            # download FDA labels, CPIC, MedlinePlus
  docker-compose exec backend python -m app.rag.ingest build --dry-run  # exact chunk/token counts, no API calls
  docker-compose exec backend python -m app.rag.ingest build            # chunk + embed (free-tier throttled)
  docker-compose exec backend python -m app.rag.ingest stats            # what is in the vector store

`build` is resumable: anything already embedded is skipped, so if the free daily quota runs out just run it
again the next day. Raw downloads are kept in backend/data/kb/raw/*.jsonl (public-domain text).
"""
from __future__ import annotations

import argparse
import hashlib
import math
import os
import sys
import time
from typing import Dict, List

from app.rag import config
from app.rag.chunking import chunk_text, estimate_tokens
from app.rag.sources import SOURCE_INFO, read_jsonl, write_jsonl
from app.rag.sources.common import Document, Http

SOURCES = ("openfda", "cpic", "medlineplus")


def raw_path(source: str):
    return config.RAW_DIR / f"{source}.jsonl"


# --------------------------------------------------------------------------- fetch
def cmd_fetch(args) -> int:
    from app.rag.sources import cpic, medlineplus, openfda
    from app.rag.vocab import DEFAULT_LABEL_DRUGS

    sources = _sources(args.source)
    http = Http()
    status = 0
    try:
        for src in sources:
            print(f"\nFetching {src} …")
            try:
                if src == "openfda":
                    drugs = [d.strip().lower() for d in args.drugs.split(",")] if args.drugs else list(DEFAULT_LABEL_DRUGS)
                    if args.include_user_medicines:
                        drugs = sorted(set(drugs) | _user_medicines())
                    docs, report = openfda.fetch(drugs, http)
                    print(f"  labels found: {len(report['found'])}/{len(drugs)}")
                    if report["not_found"]:
                        print("  no FDA label (often not US-approved): " + ", ".join(report["not_found"]))
                    for e in report["errors"]:
                        print("  error: " + e)
                elif src == "cpic":
                    docs, report = cpic.fetch(genes=args.cpic_genes, http=http)
                else:
                    kw = [k.strip() for k in args.topics.split(",")] if args.topics else None
                    docs, report = medlineplus.fetch(keywords=kw, http=http)
                n = write_jsonl(raw_path(src), docs)
                print(f"  saved {n} documents -> {raw_path(src)}")
            except Exception as e:
                status = 1
                print(f"  FAILED: {type(e).__name__}: {e}")
    finally:
        http.close()
    return status


def _user_medicines() -> set:
    """Generic names of medicines recorded in the app (all users), so their labels are included."""
    from app.database import SessionLocal
    from app.models.models import Medicine
    from app.rag.vocab import find_drugs

    db = SessionLocal()
    try:
        names = set()
        for (n,) in db.query(Medicine.drug_name).distinct():
            names |= find_drugs(n or "")
        return names
    finally:
        db.close()


# --------------------------------------------------------------------------- chunk
def chunk_documents(docs: List[Document]) -> List[Dict]:
    chunks = []
    for d in docs:
        for i, piece in enumerate(chunk_text(d.text)):
            h = hashlib.sha256(f"{d.title}\n{d.section}\n{piece}".encode()).hexdigest()
            chunks.append({"id": f"{d.doc_id}#{i}", "source": d.source, "doc_id": d.doc_id, "title": d.title,
                           "section": d.section, "url": d.url, "text": piece, "tags": d.tags,
                           "licence": d.licence, "version": d.version, "content_hash": h})
    return chunks


def embed_input(row_or_chunk) -> tuple:
    g = (lambda k: row_or_chunk[k]) if isinstance(row_or_chunk, dict) else (lambda k: getattr(row_or_chunk, k))
    return f"{g('title')} — {g('section')}", g("text")


# --------------------------------------------------------------------------- build
def cmd_build(args) -> int:
    sources = [s for s in _sources(args.source) if raw_path(s).exists()]
    if not sources:
        print("No downloaded documents found. Run `python -m app.rag.ingest fetch` first.")
        return 1
    per_source = {s: chunk_documents(read_jsonl(raw_path(s))) for s in sources}
    all_chunks = [c for cs in per_source.values() for c in cs]
    tokens = sum(estimate_tokens(" ".join(embed_input(c))) for c in all_chunks)

    print("\nKnowledge base plan")
    for s, cs in per_source.items():
        print(f"  {s:<12} {len(cs):>6} chunks   ({SOURCE_INFO[s]['licence']})")
    print(f"  {'total':<12} {len(all_chunks):>6} chunks   ≈{tokens:,} tokens to embed")

    if args.dry_run:
        if os.getenv("RAG_EMBEDDER", config.EMBEDDER).lower() == "gemini":
            _print_cost(len(all_chunks), tokens)
        else:
            mb = len(all_chunks) * config.EMBED_DIM * 4 / 1e6
            print(f"\nLocal embedding model {config.LOCAL_EMBED_MODEL} ({config.EMBED_DIM} dims): no API calls, "
                  f"no daily limit, ₹0.\n  vector storage ≈{mb:.1f} MB; usually a few minutes on a laptop CPU.")
        return 0

    from app.database import SessionLocal, engine
    from app.rag import store as store_mod
    from app.rag.embeddings import QuotaExhausted, default_embedder

    budget = args.max_texts if args.max_texts is not None else config.EMBED_MAX_TEXTS_PER_RUN
    embedder = default_embedder(max_texts=budget)
    store = store_mod.VectorStore(engine, dim=embedder.dim).ensure_schema(migrate=True)
    store_mod._store = store
    print(f"\nVector store: {store.backend} — {store.backend_note}")
    db = SessionLocal()
    try:
        for s, cs in per_source.items():
            counts = store.upsert_chunks(db, cs)
            removed = store.delete_except(db, s, [c["id"] for c in cs])
            print(f"  {s:<12} new {counts['new']}, changed {counts['changed']}, unchanged {counts['unchanged']}, "
                  f"removed {removed}")

        pending = store.pending(db, embedder.model_id)
        local = getattr(embedder, "name", "") == "local"
        print(f"\nEmbedding {len(pending)} pending chunks with {embedder.model_id} "
              + ("(local model on this computer — no API calls, no daily limit; first run downloads it) …"
                 if local else f"(this run's budget: {budget} texts) …"))
        if not local:
            _print_cost(len(pending), sum(estimate_tokens(" ".join(embed_input(r))) for r in pending), short=True)
        t0, done = time.time(), 0
        try:
            step = config.EMBED_BATCH if not local else 64   # save after every batch so nothing is lost on a stop
            for i in range(0, len(pending), step):
                rows = pending[i:i + step]
                vecs = embedder.embed_documents([embed_input(r) for r in rows])
                store.set_embeddings(db, rows, vecs, embedder.model_id)
                done += len(rows)
                if done % 100 < step or done == len(pending):
                    print(f"  embedded {done}/{len(pending)}  ({time.time() - t0:.0f}s)", flush=True)
        except QuotaExhausted as e:
            print(f"\nStopped: {e}\nProgress is saved ({done} embedded this run, {len(pending) - done} left). "
                  "Run `build` again later (free quota resets daily).")
        st = store.stats(db)
        print(f"\nDone. {st['embedded']}/{st['chunks']} chunks searchable; "
              f"{embedder.texts_sent} texts (~{embedder.tokens_sent:,} tokens) sent this run.")
        return 0
    finally:
        db.close()


def _print_cost(n_texts: int, tokens: int, short: bool = False):
    per_run = config.EMBED_MAX_TEXTS_PER_RUN
    minutes = max(n_texts / max(config.EMBED_TEXTS_PER_MIN, 1), tokens / max(config.EMBED_TOKENS_PER_MIN, 1))
    days = math.ceil(n_texts / per_run) if n_texts else 0
    mb = n_texts * config.EMBED_DIM * 4 / 1e6
    if short:
        print(f"  ≈{minutes:.0f} min at free-tier pace; {days} run(s) of ≤{per_run} texts")
        return
    print("\nFree-tier estimate (Gemini API, no billing account):")
    print(f"  texts to embed ............ {n_texts:,}")
    print(f"  tokens (≈4 chars/token) ... {tokens:,}")
    print(f"  time at throttle .......... ≈{minutes:.0f} min "
          f"(≤{config.EMBED_TEXTS_PER_MIN} texts & ≤{config.EMBED_TOKENS_PER_MIN:,} tokens per minute)")
    print(f"  runs needed ............... {days} (≤{per_run} texts per run; assumes each text counts as one "
          "request against the ~1,000/day free limit)")
    print(f"  vector storage ............ ≈{mb:.1f} MB ({config.EMBED_DIM} float32 dims)")
    print("  money ..................... ₹0 / $0 on the free tier")


# --------------------------------------------------------------------------- stats / reset
def cmd_stats(args) -> int:
    from app.database import SessionLocal, engine
    from app.rag.store import get_store

    store = get_store(engine)
    db = SessionLocal()
    try:
        st = store.stats(db)
    finally:
        db.close()
    print(f"Backend: {st['backend']} — {st['backend_note']}")
    print(f"Chunks: {st['chunks']} (embedded {st['embedded']}, pending {st['pending']}); models: {st['models']}")
    for s, v in st["by_source"].items():
        print(f"  {s:<12} {v['chunks']:>6} chunks, {v['embedded']:>6} embedded")
    print(f"Approx. size: text {st['approx_text_mb']} MB, vectors {st['approx_vector_mb']} MB")
    return 0


def cmd_reset(args) -> int:
    from app.database import SessionLocal, engine
    from app.rag.store import get_store

    store = get_store(engine)
    db = SessionLocal()
    try:
        n = store.reset(db, None if args.source == "all" else args.source)
        print(f"Deleted {n} chunks.")
    finally:
        db.close()
    return 0


def _sources(arg: str) -> List[str]:
    if arg in (None, "all"):
        return list(SOURCES)
    out = [s.strip() for s in arg.split(",")]
    bad = [s for s in out if s not in SOURCES]
    if bad:
        raise SystemExit(f"Unknown source(s): {bad}. Choose from {SOURCES} or 'all'.")
    return out


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="python -m app.rag.ingest", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("fetch", help="download source documents to backend/data/kb/raw")
    f.add_argument("--source", default="all", help="openfda,cpic,medlineplus or all")
    f.add_argument("--drugs", help="comma-separated generic names for FDA labels (default: built-in list)")
    f.add_argument("--include-user-medicines", action="store_true", help="also fetch labels for medicines in the app")
    f.add_argument("--cpic-genes", default="app", choices=["app", "all"])
    f.add_argument("--topics", help="comma-separated MedlinePlus topic keywords (default: built-in list)")
    f.set_defaults(func=cmd_fetch)

    b = sub.add_parser("build", help="chunk + embed + store (resumable)")
    b.add_argument("--source", default="all")
    b.add_argument("--dry-run", action="store_true", help="show counts and free-tier estimate only")
    b.add_argument("--max-texts", type=int, help=f"embedding budget for this run (default {config.EMBED_MAX_TEXTS_PER_RUN})")
    b.set_defaults(func=cmd_build)

    s = sub.add_parser("stats", help="show what is in the vector store")
    s.set_defaults(func=cmd_stats)

    r = sub.add_parser("reset", help="delete stored chunks")
    r.add_argument("--source", default="all")
    r.set_defaults(func=cmd_reset)

    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    sys.exit(main())
