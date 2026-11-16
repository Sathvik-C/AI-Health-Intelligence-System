"""Evaluate the RAG pipeline on a labelled question set.

  docker-compose exec backend python -m app.rag.evaluate --retrieval-only     # embeddings only (cheap)
  docker-compose exec backend python -m app.rag.evaluate                      # full: retrieval + answers + validator

Metrics (written to backend/data/kb/eval_report.json and .md):
  retrieval hit@k        share of answerable questions where a correct passage is in the top k
  MRR                    mean of 1/rank of the first correct passage (0 when missing)
  answered rate          answerable questions that got a sourced answer
  refusal accuracy       out-of-scope questions correctly answered with "no sourced answer"
  citation recall        claims that cite at least one real source ID / all claims the model wrote
  unsupported before     claims the model wrote that the judge marks NOT supported (what users would have seen
                         without the validator)
  unsupported after      same, for the claims actually shown (validator on)

Limitation: the default judge is Gemini, an AI grading an AI; spot-check the per-question claims by hand.
Calls per question: retrieval is local (0), the answer is 1 Gemini call, the judge 1 more with --judge gemini.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Dict, List

from app.rag import config

DEFAULT_SET = Path(__file__).parent / "eval" / "eval_set.jsonl"


def load_set(path: Path) -> List[Dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip() and not line.startswith("//")]


def matches(chunk, spec: Dict) -> bool:
    tags = chunk.tags or {}
    if spec.get("source") and chunk.source != spec["source"]:
        return False
    if spec.get("drug") and spec["drug"].lower() not in {d.lower() for d in tags.get("drugs") or []}:
        return False
    if spec.get("gene") and spec["gene"].upper() not in {str(g).upper() for g in tags.get("genes") or []}:
        return False
    if spec.get("section") and spec["section"].lower() not in (chunk.section or "").lower():
        return False
    if spec.get("title") and spec["title"].lower() not in (chunk.title or "").lower():
        return False
    if spec.get("text") and spec["text"].lower() not in (chunk.text or "").lower():
        return False
    return True


def run(args) -> int:
    from app.database import SessionLocal
    from app.rag import answer as ans
    from app.rag.retriever import retrieve
    from app.rag.validator import check_claim, clean_claim_text, lexical_entail

    items = load_set(Path(args.set))
    db = SessionLocal()
    rows = []
    try:
        for n, it in enumerate(items, 1):
            q = it["question"]
            hits, info = retrieve(db, q)
            rank = next((i + 1 for i, h in enumerate(hits) if any(matches(h.chunk, s) for s in it.get("expect", []))), None)
            row = {"id": it["id"], "question": q, "should_refuse": bool(it.get("should_refuse")),
                   "retrieval_mode": info.get("mode"), "rank": rank,
                   "top": [f"{h.chunk.source}:{h.chunk.title} | {h.chunk.section} ({h.score:.2f})" for h in hits[:3]]}
            if not args.retrieval_only:
                passages = ans._passages(hits, [])
                raw = ans.gemini_json(ans.SYSTEM_BASE + ans.STYLE_PATIENT, ans.build_prompt(q, hits, []))
                claims = [c for c in (raw.get("claims") or []) if isinstance(c, dict)][:config.MAX_CLAIMS]
                judged = []
                for c in claims:
                    text = clean_claim_text(c.get("text", ""))
                    valid, reason = check_claim(text, c.get("cites") or [], passages)
                    judged.append({"text": text, "cites": valid, "deterministic": reason or "ok"})
                with_ids = [j for j in judged if j["cites"]]
                verdicts = {}
                judge = ans.make_entail(ans.gemini_json) if args.judge == "gemini" else lexical_entail
                if with_ids:
                    verdicts = judge([
                        {"id": f"C{i + 1}", "claim": j["text"],
                         "evidence": "\n---\n".join(f"{passages[c].title}\n{passages[c].text[:2500]}" for c in j["cites"])}
                        for i, j in enumerate(with_ids)])
                for i, j in enumerate(with_ids):
                    j["verdict"] = verdicts.get(f"C{i + 1}", "unsupported")
                shown = [j for j in judged if j["cites"] and j["deterministic"] == "ok" and j.get("verdict") == "supported"]
                first_ok = bool(judged) and judged[0] in shown
                status = ("answered" if str(raw.get("answer_status")).lower() != "not_in_sources" and shown and first_ok
                          and len(shown) / len(judged) >= config.MIN_SURVIVAL else "no_sourced_answer")
                row.update({"claims": judged, "status": status,
                            "n_claims": len(judged), "n_with_ids": len(with_ids),
                            "n_unsupported_before": sum(1 for j in judged if j.get("verdict") != "supported"),
                            "n_shown": len(shown) if status == "answered" else 0})
                time.sleep(args.pause)
            rows.append(row)
            print(f"[{n}/{len(items)}] {it['id']}: rank={rank} " + (f"status={row.get('status')}" if not args.retrieval_only else ""),
                  flush=True)
    finally:
        db.close()

    answerable = [r for r in rows if not r["should_refuse"]]
    k = config.TOP_K
    report = {
        "k": k, "questions": len(rows), "answerable": len(answerable),
        "retrieval_hit_at_k": _pct(sum(1 for r in answerable if r["rank"]), len(answerable)),
        "mrr": round(sum(1 / r["rank"] for r in answerable if r["rank"]) / max(len(answerable), 1), 3),
    }
    if not args.retrieval_only:
        refuse = [r for r in rows if r["should_refuse"]]
        claims = sum(r["n_claims"] for r in rows)
        report.update({
            "answered_rate": _pct(sum(1 for r in answerable if r["status"] == "answered"), len(answerable)),
            "refusal_accuracy": _pct(sum(1 for r in refuse if r["status"] == "no_sourced_answer"), len(refuse)),
            "citation_recall": _pct(sum(r["n_with_ids"] for r in rows), claims),
            "unsupported_before_validator": _pct(sum(r["n_unsupported_before"] for r in rows), claims),
            "unsupported_after_validator": "0% by construction (only judge-supported, deterministic-pass claims are shown)",
            "claims_written": claims, "claims_shown": sum(r["n_shown"] for r in rows),
        })
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"summary": report, "rows": rows}, indent=1, ensure_ascii=False))
    md = ["| Metric | Value |", "|---|---|"] + [f"| {k} | {v} |" for k, v in report.items()]
    out.with_suffix(".md").write_text("\n".join(md) + "\n")
    print("\n" + "\n".join(md))
    print(f"\nFull report: {out}")
    return 0


def _pct(a: int, b: int) -> str:
    return f"{100 * a / b:.0f}% ({a}/{b})" if b else "n/a"


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="python -m app.rag.evaluate", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--set", default=str(DEFAULT_SET))
    p.add_argument("--retrieval-only", action="store_true")
    p.add_argument("--judge", choices=["gemini", "lexical"], default="gemini",
                   help="who grades 'is this sentence supported?' — gemini (independent of the app's Python "
                        "check, 1 extra call per question) or lexical (the app's own check, no extra call)")
    p.add_argument("--pause", type=float, default=8.0, help="seconds between questions (free-tier rate limits)")
    p.add_argument("--out", default=str(config.DATA_DIR / "eval_report.json"))
    return run(p.parse_args(argv))


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    sys.exit(main())
