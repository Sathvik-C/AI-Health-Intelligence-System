"""Grounding / fallback behaviour of the AI insights service (Gemini is mocked)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.ai import insights_service as svc  # noqa: E402

FACTS = [
    {"id": "F1", "category": "profile", "text": "Patient profile — 44 years old, male"},
    {"id": "F2", "category": "biomarker", "text": "HbA1c: latest 5.9 % ...", "marker": "hba1c", "direction": "improving",
     "latest_status": "above", "n": 8, "pct_change": -31},
    {"id": "F3", "category": "wearable", "text": "Wearable Daily steps: average 10,447", "metric": "steps", "recent": 10447,
     "change": 975},
]
PRECISION = {"monitoring_plan": [], "profile_completeness": {"missing": []}, "unit_problems": []}


def test_validate_drops_uncited_and_fabricated_evidence():
    payload = {
        "headline": "Good progress", "overall_status": "improving", "summary": "ok",
        "key_findings": [
            {"title": "HbA1c down", "explanation": "x", "severity": "positive", "evidence_ids": ["F2"]},
            {"title": "Invented", "explanation": "cites a fact that does not exist", "severity": "act", "evidence_ids": ["F99"]},
            {"title": "No evidence", "explanation": "cites nothing", "severity": "watch", "evidence_ids": []},
            {"title": "Bad severity", "explanation": "x", "severity": "critical!!", "evidence_ids": ["F1"]},
        ],
        "connections": [{"title": "One fact only", "explanation": "x", "evidence_ids": ["F2"]},
                        {"title": "Steps and HbA1c", "explanation": "x", "evidence_ids": ["F2", "F3"]}],
        "overall_status_typo": "x",
    }
    clean, stats = svc.validate(payload, FACTS)
    assert [f["title"] for f in clean["key_findings"]] == ["HbA1c down", "Bad severity"]
    assert clean["key_findings"][1]["severity"] == "info"
    assert [c["title"] for c in clean["connections"]] == ["Steps and HbA1c"]
    assert stats["dropped"] == 3


def test_generate_falls_back_when_gemini_fails(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("quota exceeded")
    monkeypatch.setattr(svc, "_gemini_generate", boom)
    out = svc.generate(FACTS, PRECISION, use_ai=True)
    assert out["source"] == "rule_based" and "quota" in out["error"]
    assert out["insights"]["key_findings"], "fallback should still produce findings"


def test_generate_uses_gemini_when_grounded(monkeypatch):
    monkeypatch.setattr(svc, "_gemini_generate", lambda facts, model: {
        "headline": "h", "overall_status": "improving", "summary": "s",
        "key_findings": [{"title": "t", "explanation": "e", "severity": "positive", "evidence_ids": ["F2"]}]})
    out = svc.generate(FACTS, PRECISION, model_name="gemini-test", use_ai=True)
    assert out["source"] == "gemini" and out["model"] == "gemini-test"


def test_generate_falls_back_when_gemini_ungrounded(monkeypatch):
    monkeypatch.setattr(svc, "_gemini_generate", lambda facts, model: {
        "key_findings": [{"title": "t", "explanation": "e", "severity": "act", "evidence_ids": ["F404"]}]})
    out = svc.generate(FACTS, PRECISION, use_ai=True)
    assert out["source"] == "rule_based" and "no findings with valid evidence" in out["error"]


def test_default_uses_rules_without_calling_gemini(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("Gemini must not be called unless use_ai=True")
    monkeypatch.setattr(svc, "_gemini_generate", boom)
    out = svc.generate(FACTS, PRECISION)
    assert out["source"] == "rule_based" and out["error"] is None and out["insights"]["key_findings"]
