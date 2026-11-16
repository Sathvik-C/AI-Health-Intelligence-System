# Where the app uses Gemini — and where plain Python replaced it

Goal: call Gemini only where Python cannot do the job, so the app stays within the free tier and the same
input always gives the same output.

## Summary

| Feature | Before | Now | Gemini calls now |
|---|---|---|---|
| Lab report PDF → values | Gemini read every PDF | **Python** reads tables and text lines (`app/services/report_parser.py`); Gemini only if Python finds fewer than 3 values | 0 for normal PDFs |
| Lab report photo/scan | Gemini vision | Gemini vision (Python cannot read images without OCR) | 1 per photo |
| Health Insights summary | Gemini | **Python** trend comparison (`app/services/summary_rules.py`), same JSON | 0 |
| Nutrition plan | Gemini invented a plan | **Python** rules + curated Indian meals (`app/services/diet_rules.py`) | 0 |
| ECG summary text | Gemini, template fallback | **Template** by default (`ECG_LLM_SUMMARY=1` to use Gemini) | 0 |
| AI Insights tab | Gemini on every data change | **Python rules** by default; Gemini only on "Rewrite with AI" | 0 unless clicked |
| Ask Your Health Record — search | Gemini embeddings (≈1,000/day free) | **Local model** BAAI/bge-small-en-v1.5 on the CPU | 0 |
| Ask Your Health Record — citation check | Gemini judge | **Python** word-overlap + negation check | 0 |
| Ask Your Health Record — answer | Gemini | Gemini | 1 per question |

## Evidence of equal accuracy

**PDF reading.** On the 8 sample reports, the Python text reader was compared with an independent answer key
(pdfplumber's table cells): **328 of 328 values identical** (name, value, unit, low and high limit), and the report
date was correct on all 8. Tests: `backend/tests/test_report_parser.py` (also covers "Name : value (low-high)",
"< 200", "> 40", "lakhs/cumm" and lines that must be ignored, such as patient details and doctor's notes).

**Health Insights summary.** Built from the same `trend_summary` engine the AI Insights tab uses. Every sentence
is a computed comparison of first vs latest value against the report's own reference range, so there is nothing
to hallucinate. Tests: `backend/tests/test_rules.py`.

**Nutrition.** Each change in the plan is tied to a measured value and a widely used cut-off (ADA prediabetes
HbA1c ≥ 5.7 % / fasting glucose ≥ 100 mg/dL; ACC/AHA BP ≥ 130/80; Asian BMI ≥ 23; lab reference ranges).
Calories use the Mifflin-St Jeor equation. It is general guidance, not a prescription.

**Chat search.** The local model is smaller than Gemini's embedding model, so retrieval quality may differ;
measure it with `python -m app.rag.evaluate --retrieval-only` (hit@6 and MRR on 28 labelled questions).

**Citation check.** The Python check is deliberately strict: a sentence whose words are mostly not in its source,
or an "avoid / not recommended" sentence whose source has no caution word, is removed. Compare it with an AI judge
using `python -m app.rag.evaluate --judge gemini` vs `--judge lexical`.

## What still needs Gemini, and why
- **Writing chat answers** in natural language from the retrieved passages.
- **Photos/scans of reports** — reading text from an image needs AI or OCR.
- **Unusual PDF layouts** where the Python reader finds fewer than 3 values.
- **"Rewrite with AI"** on the AI Insights tab, only when the user clicks it.
