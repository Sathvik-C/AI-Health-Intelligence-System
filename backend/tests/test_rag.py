"""RAG: fetch parsers, chunking, vector store, retrieval, citation validator and answer pipeline.

Runs offline: fixtures are synthetic, Gemini is replaced by HashEmbedder + fake LLM functions.
Set RAG_TEST_PG_URL=postgresql://user:pass@host/db to also run the pgvector integration test.
"""
import io
import json
import os
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.database import Base  # noqa: E402
from app.models import models  # noqa: E402,F401  (registers tables)
from app.rag import answer as ans  # noqa: E402
from app.rag import config, ingest, retriever  # noqa: E402
from app.rag.chunking import chunk_text  # noqa: E402
from app.rag.embeddings import HashEmbedder, QuotaExhausted, _Throttle  # noqa: E402
from app.rag.sources import cpic, medlineplus, openfda  # noqa: E402
from app.rag.sources.common import read_jsonl, write_jsonl  # noqa: E402
from app.rag.store import VectorStore  # noqa: E402
from app.rag.validator import Passage, check_claim, claim_numbers, validate  # noqa: E402
from app.rag.vocab import extract_entities, find_drugs, find_genes, tag_index  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


# ----------------------------------------------------------------------------- helpers
def _docs():
    label = openfda.select_label(json.load(open(FIX / "openfda_metformin.json"))["results"], "metformin")
    docs = openfda.label_to_documents(label, "metformin")
    c = json.load(open(FIX / "cpic_clopidogrel.json"))
    docs += cpic.recommendations_to_documents(
        c["recommendations"], {g["id"]: g for g in c["guidelines"]}, {d["drugid"]: d["name"] for d in c["drugs"]},
        genes_filter={"CYP2C19", "SLCO1B1"}, accessed="2026-11-14")
    with open(FIX / "medlineplus_topics.xml", "rb") as f:
        docs += medlineplus.parse_topics(f, medlineplus.DEFAULT_TOPIC_KEYWORDS, "2026-11-14")
    return docs


@pytest.fixture()
def kb(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'kb.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    store = VectorStore(engine, dim=256).ensure_schema()
    emb = HashEmbedder(dim=256)
    chunks = ingest.chunk_documents(_docs())
    store.upsert_chunks(db, chunks)
    rows = store.pending(db, emb.model_id)
    store.set_embeddings(db, rows, emb.embed_documents([ingest.embed_input(r) for r in rows]), emb.model_id)
    import app.rag.store as store_mod
    store_mod._store = store
    retriever.set_query_embedder(emb)
    retriever._vocab_key = None
    yield db, store, emb, chunks
    db.close()
    store_mod._store = None
    retriever.set_query_embedder(None)


# ----------------------------------------------------------------------------- parsers
def test_openfda_selects_single_ingredient_prescription_label():
    results = json.load(open(FIX / "openfda_metformin.json"))["results"]
    label = openfda.select_label(results, "metformin")
    assert label["set_id"] == "test-set-1"           # not the combo, not the OTC one
    docs = openfda.label_to_documents(label, "metformin")
    sections = [d.section for d in docs]
    assert "Warnings" not in sections                 # old-format section skipped when PLR exists
    assert "Indications and usage" not in sections    # too short to keep
    assert {"Boxed warning", "Contraindications", "Warnings and precautions", "Drug interactions"} <= set(sections)
    ci = next(d for d in docs if d.section == "Contraindications")
    assert ci.url.endswith("setid=test-set-1") and ci.version == "label effective 2024-01-15"
    assert ci.title == "Metformin Hydrochloride (Testformin) — FDA label"
    wp = next(d for d in docs if d.section == "Warnings and precautions")
    assert wp.tags["mentioned_drugs"] == ["glimepiride"]       # other known drugs named in the text
    assert "metformin" not in wp.tags["mentioned_drugs"]


def test_cpic_dedupes_filters_and_formats():
    c = json.load(open(FIX / "cpic_clopidogrel.json"))
    docs = cpic.recommendations_to_documents(
        c["recommendations"], {g["id"]: g for g in c["guidelines"]}, {d["drugid"]: d["name"] for d in c["drugs"]},
        genes_filter={"CYP2C19"}, accessed="2026-11-14")
    assert len(docs) == 2                              # 2 PM rows merged, indeterminate + IFNL3 dropped
    pm = next(d for d in docs if "Poor Metabolizer" in d.title)
    assert "Recommendation: Avoid standard-dose clopidogrel" in pm.text
    assert "Population: CV indications." in pm.text and "Comments" not in pm.text
    assert pm.tags == {"drugs": ["clopidogrel"], "genes": ["CYP2C19"]}
    assert pm.version == "CPIC recommendation v3; accessed 2026-11-14"
    assert pm.url.startswith("https://cpicpgx.org/guidelines/guideline-for-clopidogrel")


def test_medlineplus_parses_english_matching_topics_and_strips_html():
    with open(FIX / "medlineplus_topics.xml", "rb") as f:
        docs = medlineplus.parse_topics(f, medlineplus.DEFAULT_TOPIC_KEYWORDS, "2026-11-14")
    titles = [d.title for d in docs]
    assert titles == ["Diabetes — MedlinePlus", "Chronic Kidney Disease — MedlinePlus"]
    assert "<" not in docs[0].text and "blood sugar" in docs[0].text
    assert "kidneys are damaged. An eGFR test" in docs[1].text   # child elements -> spaced text
    assert docs[0].tags["drugs"] == ["metformin"]
    page = '<a href="xml/mplus_topics_2026-11-12.xml">x</a> <a href="xml/mplus_topics_compressed_2026-11-13.zip">'
    assert medlineplus.latest_file(page) == ("mplus_topics_compressed_2026-11-13.zip", "2026-11-13")


def test_jsonl_roundtrip(tmp_path):
    docs = _docs()
    write_jsonl(tmp_path / "x.jsonl", docs)
    assert [d.doc_id for d in read_jsonl(tmp_path / "x.jsonl")] == [d.doc_id for d in docs]


# ----------------------------------------------------------------------------- chunking & vocab
def test_chunking_respects_size_overlap_and_subsections():
    label = openfda.select_label(json.load(open(FIX / "openfda_metformin.json"))["results"], "metformin")
    wp = next(d for d in openfda.label_to_documents(label, "metformin") if d.section == "Warnings and precautions")
    chunks = chunk_text(wp.text, max_words=280, overlap_words=40)
    assert len(chunks) >= 3
    assert all(len(c.split()) <= 280 + 41 for c in chunks)
    assert chunks[1].startswith("… ")                       # overlap marker
    assert any(c.lstrip("… ").find("5.2 Vitamin B12") >= 0 for c in chunks)
    assert chunk_text("short text") == ["short text"]


def test_entities_and_tag_index():
    e = extract_entities("Is Plavix safe for a CYP2C19 poor metabolizer? Also HLA-B*58:01 and allopurinol")
    assert "clopidogrel" in e["drugs"] and "allopurinol" in e["drugs"]
    assert {"CYP2C19", "HLA-B", "HLA-B*58:01"} <= set(e["genes"])
    assert find_genes("CYP2C190") == set()                  # no partial-token matches
    assert tag_index({"drugs": ["Metformin"], "genes": ["CYP2C19"]}) == "|drug:metformin|gene:cyp2c19|"


# ----------------------------------------------------------------------------- store & retrieval
def test_store_upsert_is_incremental(kb):
    db, store, emb, chunks = kb
    assert store.pending(db, emb.model_id) == []
    changed = dict(chunks[0], text=chunks[0]["text"] + " edited", content_hash="new")
    counts = store.upsert_chunks(db, [changed] + chunks[1:])
    assert counts == {"new": 0, "changed": 1, "unchanged": len(chunks) - 1}
    assert [r.id for r in store.pending(db, emb.model_id)] == [chunks[0]["id"]]
    assert store.delete_except(db, "medlineplus", []) == 2
    st = store.stats(db)
    assert st["backend"] == "numpy" and "medlineplus" not in st["by_source"]


def test_retrieval_finds_exact_drug_section(kb):
    db, store, emb, _ = kb
    hits, info = retriever.retrieve(db, "Can I take metformin if my eGFR is below 30 because of kidney disease?")
    assert info["mode"] == "hybrid" and info["entities"]["drugs"] == ["metformin"]
    assert hits[0].chunk.doc_id.startswith("openfda:metformin")
    assert any(h.chunk.section == "Contraindications" for h in hits[:3])
    per_doc = {}
    for h in hits:
        per_doc[h.chunk.doc_id] = per_doc.get(h.chunk.doc_id, 0) + 1
    assert max(per_doc.values()) <= config.MAX_CHUNKS_PER_DOC


def test_retrieval_gene_question_hits_cpic(kb):
    db, *_ = kb
    hits, _ = retriever.retrieve(db, "I am a CYP2C19 poor metabolizer, what about clopidogrel?")
    assert hits[0].chunk.source == "cpic" and "Poor Metabolizer" in hits[0].chunk.title


def test_retrieval_falls_back_to_keywords_when_embedding_fails(kb):
    db, *_ = kb

    class Broken(HashEmbedder):
        def embed_query(self, text):
            raise QuotaExhausted("daily quota")
    hits, info = retriever.retrieve(db, "metformin contraindications kidney", embedder=Broken(dim=256))
    assert info["mode"] == "keyword" and hits and hits[0].chunk.doc_id.startswith("openfda:metformin")


def test_empty_kb_reports_empty(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'empty.db'}")
    Base.metadata.create_all(engine)
    import app.rag.store as store_mod
    store_mod._store = None
    db = sessionmaker(bind=engine)()
    hits, info = retriever.retrieve(db, "anything", embedder=HashEmbedder(dim=256))
    assert hits == [] and info["kb_chunks"] == 0 and "empty" in info["note"]
    store_mod._store = None


# ----------------------------------------------------------------------------- validator
P = {
    "S1": Passage("S1", "Contraindicated in severe renal impairment (eGFR below 30 mL/min/1.73 m2).", "openfda",
                  {"drugs": ["metformin"]}),
    "S2": Passage("S2", "Diabetes means blood sugar is too high. Metformin is a commonly used medicine.", "medlineplus",
                  {"drugs": ["metformin"]}),
    "S3": Passage("S3", "CYP2C19 Poor Metabolizer: avoid standard-dose clopidogrel; use prasugrel or ticagrelor.", "cpic",
                  {"drugs": ["clopidogrel"], "genes": ["CYP2C19"]}),
    "F1": Passage("F1", "HbA1c: latest 7.2 % on 2026-03-01", "user", category="biomarker"),
    "F2": Passage("F2", "Medicine–lab check (watch): metformin — eGFR 42: dose review advised", "user", category="drug_lab"),
}


@pytest.mark.parametrize("text,cites,reason", [
    ("The label says metformin is contraindicated when eGFR is below 30.", ["S1"], ""),
    ("Made-up citation.", ["S9"], "no_valid_citation"),
    ("No citation at all.", [], "no_valid_citation"),
    ("The label says avoid metformin when eGFR is below 45.", ["S1"], "number_not_in_source"),
    ("The label says avoid glipizide when eGFR is below 30.", ["S1"], "name_not_in_source"),
    ("Clopidogrel needs a CYP2D6 test.", ["S3"], "name_not_in_source"),
    ("Avoid metformin if you have diabetes.", ["S2"], "medication_rule_without_official_source"),
    ("Your HbA1c is 7.2 %.", ["S2"], "number_not_in_source"),
    ("Your HbA1c was 7.2 % on 2026-03-01.", ["F1"], ""),
    ("Your metformin dose review was flagged for eGFR 42.", ["F2"], ""),
    ("For CYP2C19 poor metabolizers CPIC advises avoiding standard-dose clopidogrel.", ["S3"], ""),
    ("Type 2 diabetes means blood sugar is too high.", ["S2"], ""),
])
def test_check_claim(text, cites, reason):
    assert check_claim(text, cites, P)[1] == reason


def test_personal_value_needs_user_fact():
    p = dict(P, S4=Passage("S4", "An HbA1c of 7.2 % is above many targets.", "medlineplus"))
    assert check_claim("Your HbA1c is 7.2 %.", ["S4"], p)[1] == "personal_value_without_user_fact"


def test_claim_numbers_ignore_gene_and_allele_digits():
    assert claim_numbers("CYP2C19 and HLA-B*57:01 with eGFR 30 and 1,000 mg") == [30.0, 1000.0]


def test_validate_entailment_and_inline_cites():
    raw = [{"text": "Metformin is contraindicated when eGFR is below 30 [S1].", "cites": ["S1"]},
           {"text": "Clopidogrel should be avoided by CYP2C19 poor metabolizers.", "cites": ["s3"]}]
    results, info = validate(raw, P, entail=lambda items: {"C1": "supported", "C2": "partial"})
    assert results[0].kept and results[0].text.endswith("below 30.")
    assert not results[1].kept and results[1].reason == "not_entailed"
    assert info["entailment"] == "passed" and info["kept"] == 1

    def boom(items):
        raise RuntimeError("quota")
    results, info = validate(raw, P, entail=boom)
    assert info["entailment"] == "unavailable" and info["kept"] == 2


# ----------------------------------------------------------------------------- answer pipeline
FACTS = [{"id": "F1", "category": "biomarker", "text": "eGFR (calculated): 25 mL/min/1.73 m² on 2026-10-01"}]


def _llm(answer_payload, verdicts=None):
    def llm(system, prompt):
        if system.startswith("You are a strict fact-checker"):
            items = json.loads(prompt.split("ITEMS:\n", 1)[1])
            return {"verdicts": [{"id": it["id"], "verdict": (verdicts or {}).get(it["id"], "supported")} for it in items]}
        assert "S1" in prompt and "QUESTION:" in prompt
        return answer_payload(prompt) if callable(answer_payload) else answer_payload
    return llm


def _first_cite(prompt, needle):
    for line in prompt.splitlines():
        if line.startswith("[S") and needle in line:
            return line[1:line.index("]")]
    raise AssertionError(needle)


def test_answer_with_citations(kb):
    db, *_ = kb

    def payload(prompt):
        s = _first_cite(prompt, "Contraindications")
        return {"answer_status": "answered", "claims": [
            {"text": "The metformin label lists severe renal impairment (eGFR below 30 mL/min/1.73 m2) as a contraindication.", "cites": [s]},
            {"text": "Your latest calculated eGFR is 25 mL/min/1.73 m².", "cites": ["F1"]},
            {"text": "Discuss this with your doctor before any change.", "cites": [s, "F1"]}]}
    out = ans.answer_question(db, None, "Is metformin OK with my kidneys?", llm=_llm(payload), facts=FACTS, meds=["metformin"])
    assert out["status"] == "answered", out
    assert [c["refs"] for c in out["claims"]] == [[1], [2], [1, 2]]
    assert out["sources"][0]["kind"] == "openfda" and out["sources"][1]["kind"] == "user"
    assert "[1]" in out["answer"] and "Sources:" in out["answer"]
    assert out["verification"]["entailment"] == "passed"


def test_answer_refuses_when_not_in_sources_or_main_claim_fails(kb):
    db, *_ = kb
    out = ans.answer_question(db, None, "Who won the cricket match?", llm=_llm({"answer_status": "not_in_sources", "claims": []}),
                              facts=FACTS)
    assert out["status"] == "no_sourced_answer" and out["claims"] == []

    def payload(prompt):
        return {"answer_status": "answered", "claims": [
            {"text": "Metformin is safe at any eGFR above 15.", "cites": [_first_cite(prompt, "Contraindications")]},
            {"text": "Your latest calculated eGFR is 25 mL/min/1.73 m².", "cites": ["F1"]}]}
    out = ans.answer_question(db, None, "Is metformin OK for my kidneys?", llm=_llm(payload), facts=FACTS)
    assert out["status"] == "no_sourced_answer"
    assert out["verification"]["dropped"][0]["reason"] == "number_not_in_source"
    assert out["related_sources"]


def test_answer_reports_llm_failure(kb):
    db, *_ = kb

    def llm(system, prompt):
        raise TimeoutError("gemini down")
    out = ans.answer_question(db, None, "metformin?", llm=llm, facts=FACTS)
    assert out["status"] == "error" and "TimeoutError" in out["answer"]


# ----------------------------------------------------------------------------- ingest CLI & throttle
def test_ingest_build_dry_run_and_real(tmp_path, monkeypatch, capsys):
    raw = tmp_path / "raw"
    monkeypatch.setattr(config, "RAW_DIR", raw)
    docs = _docs()
    for src in ("openfda", "cpic", "medlineplus"):
        write_jsonl(raw / f"{src}.jsonl", [d for d in docs if d.source == src])
    assert ingest.main(["build", "--dry-run"]) == 0
    out = capsys.readouterr().out
    assert "no API calls" in out and "₹0" in out           # default: local model
    monkeypatch.setenv("RAG_EMBEDDER", "gemini")
    assert ingest.main(["build", "--dry-run"]) == 0
    assert "Free-tier estimate" in capsys.readouterr().out

    engine = create_engine(f"sqlite:///{tmp_path / 'b.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    import app.database as database
    import app.rag.store as store_mod
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(database, "SessionLocal", sessionmaker(bind=engine))
    monkeypatch.setenv("RAG_EMBEDDER", "hash")
    store_mod._store = None
    assert ingest.main(["build", "--max-texts", "5"]) == 0          # budget stops early, progress saved
    out = capsys.readouterr().out
    assert "Stopped" in out
    assert ingest.main(["build"]) == 0
    out = capsys.readouterr().out
    assert "Done." in out
    db = database.SessionLocal()
    st = store_mod.get_store(engine).stats(db)
    assert st["pending"] == 0 and st["chunks"] == len(ingest.chunk_documents(docs))
    db.close()
    store_mod._store = None


def test_throttle_waits_when_budget_exceeded():
    t = _Throttle(texts_per_min=10, tokens_per_min=1000)
    clock = {"now": 0.0}
    slept = []

    def sleep(s):
        slept.append(s)
        clock["now"] += s
    for _ in range(3):
        t.wait(5, 100, sleep=sleep, now=lambda: clock["now"])
    assert slept and slept[0] >= 59


# ----------------------------------------------------------------------------- pgvector (optional)
@pytest.mark.skipif(not os.getenv("RAG_TEST_PG_URL"), reason="set RAG_TEST_PG_URL to run against Postgres+pgvector")
def test_pgvector_dimension_migration():
    engine = create_engine(os.environ["RAG_TEST_PG_URL"])
    models.KBChunk.__table__.drop(engine, checkfirst=True)
    assert VectorStore(engine, dim=768, backend="pgvector").ensure_schema().backend == "pgvector"
    web = VectorStore(engine, dim=384).ensure_schema()              # web app: don't touch, fall back
    assert web.backend == "numpy" and "768" in web.backend_note
    build = VectorStore(engine, dim=384).ensure_schema(migrate=True)  # ingest build: rebuild column
    assert build.backend == "pgvector"
    from sqlalchemy import text as sql
    with engine.connect() as c:
        assert c.execute(sql("SELECT atttypmod FROM pg_attribute WHERE attrelid='kb_chunks'::regclass "
                             "AND attname='embedding_vec' AND NOT attisdropped")).scalar() == 384


@pytest.mark.skipif(not os.getenv("RAG_TEST_PG_URL"), reason="set RAG_TEST_PG_URL to run against Postgres+pgvector")
def test_pgvector_matches_numpy_ranking():
    engine = create_engine(os.environ["RAG_TEST_PG_URL"])
    models.KBChunk.__table__.drop(engine, checkfirst=True)
    store = VectorStore(engine, dim=256, backend="pgvector").ensure_schema()
    assert store.backend == "pgvector"
    db = sessionmaker(bind=engine)()
    emb = HashEmbedder(dim=256)
    store.upsert_chunks(db, ingest.chunk_documents(_docs()))
    rows = store.pending(db, emb.model_id)
    store.set_embeddings(db, rows, emb.embed_documents([ingest.embed_input(r) for r in rows]), emb.model_id)
    q = emb.embed_query("metformin contraindicated renal impairment eGFR")
    pg = store.search(db, q, 5, emb.model_id)
    store.backend = "numpy"
    npy = store.search(db, q, 5, emb.model_id)
    assert [i for i, _ in pg][:3] == [i for i, _ in npy][:3]
    assert all(abs(a[1] - b[1]) < 1e-4 for a, b in zip(pg, npy))
    db.close()


# ----------------------------------------------------------------------------- Python support check (no AI)
from app.rag.validator import lexical_entail, support_score  # noqa: E402

EVID = ("Metformin Hydrochloride — FDA label — Contraindications\n4 CONTRAINDICATIONS contraindicated in patients with "
        "severe renal impairment (eGFR below 30 mL/min/1.73 m2) and in acute or chronic metabolic acidosis.")


@pytest.mark.parametrize("claim,verdict", [
    ("The metformin label lists severe renal impairment (eGFR below 30 mL/min/1.73 m2) as a contraindication.", "supported"),
    ("Metformin is contraindicated in metabolic acidosis.", "supported"),
    ("Discuss this with your doctor before any change.", "supported"),               # advice only
    ("Metformin improves memory and sleep quality in older adults.", "unsupported"),
    ("Avoid metformin with grapefruit juice.", "unsupported"),
])
def test_lexical_entail(claim, verdict):
    assert lexical_entail([{"id": "C1", "claim": claim, "evidence": EVID}])["C1"] == verdict


def test_direction_mismatch_is_unsupported():
    ev = "Clopidogrel: normal metabolizer. Recommendation: use at standard dose."
    assert lexical_entail([{"id": "C1", "claim": "Avoid clopidogrel at standard dose.", "evidence": ev}])["C1"] == "unsupported"
    assert support_score("use clopidogrel at standard dose", ev) == 1.0


def test_answer_uses_python_check_by_default(kb):
    db, *_ = kb
    calls = []

    def llm(system, prompt):
        calls.append(system[:20])
        s = _first_cite(prompt, "Contraindications")
        return {"answer_status": "answered", "claims": [
            {"text": "The metformin label lists severe renal impairment (eGFR below 30 mL/min/1.73 m2) as a contraindication.", "cites": [s]},
            {"text": "Metformin also protects the heart in everyone.", "cites": [s]}]}
    out = ans.answer_question(db, None, "Is metformin OK with kidney disease?", llm=llm, facts=FACTS)
    assert len(calls) == 1                                    # only the answer — no Gemini judge call
    assert out["status"] == "answered" and out["verification"]["check"] == "lexical"
    assert [d["reason"] for d in out["verification"]["dropped"]] == ["not_entailed"]


# ----------------------------------------------------------------------------- local embedder (fastembed mocked)
def test_local_embedder_prefix_normalise_and_dim(monkeypatch):
    import types
    from app.rag import embeddings
    seen = []

    class FakeTE:
        def __init__(self, model_name, cache_dir):
            seen.append(("init", model_name))

        def embed(self, texts, batch_size=32):
            for t in texts:
                seen.append(t)
                yield np.full(384, 2.0, dtype=np.float32)
    monkeypatch.setitem(sys.modules, "fastembed", types.SimpleNamespace(TextEmbedding=FakeTE))
    e = embeddings.LocalEmbedder()
    q = e.embed_query("metformin kidneys")
    assert seen[1].startswith("Represent this sentence for searching relevant passages: ")
    assert abs(float(np.linalg.norm(q)) - 1.0) < 1e-6 and e.model_id == "BAAI/bge-small-en-v1.5@384"
    docs = e.embed_documents([("Title", "text")])
    assert seen[-1] == "Title\ntext" and len(docs) == 1
    bad = embeddings.LocalEmbedder(dim=768)
    with pytest.raises(RuntimeError):
        bad.embed_query("x")


def test_keyword_mode_when_library_not_embedded_for_current_model(kb):
    db, store, emb, _ = kb
    other = HashEmbedder(dim=256)
    other_id = "other-model@256"
    type(other).model_id = property(lambda self: other_id)
    try:
        hits, info = retriever.retrieve(db, "metformin contraindications kidney", embedder=other)
    finally:
        type(other).model_id = property(lambda self: f"hash@{self.dim}")
    assert info["mode"] == "keyword" and "ingest build" in info["note"] and hits
