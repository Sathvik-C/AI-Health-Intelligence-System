# Dashboard tabs: Clinical Dashboard · AI Insights & Precision Medicine

The Dashboard (`/dashboard`) now has two tabs:

| Tab | URL | What drives it |
|---|---|---|
| **Clinical Dashboard** | `/dashboard` | Python only — trends, rule-based risk scores, z-score anomalies, linear forecasts (the original dashboard, with the fixes in `REVIEW.md`) |
| **AI Insights & Precision Medicine** | `/dashboard?tab=ai` | Validated clinical calculators in Python + Gemini-written insights grounded in numbered facts |

---

## UX design (v2 — compact layout)

**Problem found in the audit (v1):** each tab was ~3,400 px tall on desktop and ~6,400–6,600 px on a phone
(≈7 screens of scrolling); the same fact appeared up to 4 times (BMI as a finding, an AI note, a calculator card and
a threshold row); technical names came first ("Pooled Cohort Equations"); every card carried three blocks of text;
urgent and reassuring items were mixed together.

**Principles applied**
1. *Answer first, detail on demand* — a one-glance summary on top; rows expand, cards open a side sheet.
2. *One question per view* — the AI tab is split into Overview · Risk checks · Medicines · Next steps (sticky switcher with counts).
3. *Plain words first* — "Kidney function" before "eGFR · CKD-EPI 2021"; severities read "Discuss soon / Watch / FYI / Good news".
4. *Prioritise* — "Needs your attention" is separated from "Going well"; out-of-range markers and biggest changes are listed first.
5. *No duplicates* — each fact lives in one place; redundant panels (Health Story card, Important Health Areas) were folded into the summary strip and risk scores.
6. *Mobile first* — bottom sheets on phones, short tab labels, 3-up risk gauges, forms grouped into numbered steps with genetic results collapsed.

**Structure**
| Tab | Layout |
|---|---|
| Clinical | Header with tab switch → 4-tile summary strip (in range, outside range, changed, latest report) → one-line unusual-reading alert → compact risk gauges → "Changes since your last report" (sorted, show-all) beside "Recent activity" (readable report names, upcoming tests) → biomarker explorer |
| AI Insights & Precision | Summary card (status, headline, Profile + Refresh) → section switcher → **Overview** (needs attention / going well / patterns) · **Risk checks** (6 tiles → detail sheet with chart, meaning, why-personal, "how it's calculated"; accordions for personal thresholds, heart-risk boosters, AI notes) · **Medicines** (one row per medicine with gene + lab checks; gene-test suggestion) · **Next steps** (suggested tests, questions to copy, data gaps) |

**Measured page height (same demo data, headless Chrome)**
| View | Before | After |
|---|---|---|
| Clinical — desktop 1440 px | 3,336 px | 1,794 px |
| Clinical — phone 390 px | 6,559 px | 3,378 px |
| AI tab — desktop | 3,388 px | ≈900 px per section (fits one screen) |
| AI tab — phone | 6,408 px | 790–1,140 px per section |

---

## 1. How the AI tab works

```
Lab reports ─┐
Wearables  ──┤                     ┌──► Precision report (deterministic) ──────────────┐
Home logs  ──┼─► health_facts.py ──┤                                                    ├─► React tab
Medicines  ──┤   (normalise names, └──► build_facts() → F1…Fn ─► Gemini ─► validate() ─┘
Profile    ──┘    units, trends)                                   │ fails / ungrounded
                                                                   └─► rule-based fallback
```

**Technical.** `health_facts.load_context()` maps every lab name to a canonical marker (`biomarker_catalog.py`),
converts units (e.g. platelets in lakhs/cumm → 10⁹/L, creatinine µmol/L → mg/dL), and merges home BP/glucose logs.
`precision_service.build_precision_report()` runs the calculators. `insights_service.build_facts()` turns everything
into numbered facts (`F1 … F64` for the demo patient). Gemini receives **only those facts** — never raw report text —
and must return JSON in which every item cites fact IDs. `validate()` drops any item that cites no fact or a fact that
doesn't exist, clamps severities and lengths, and if nothing grounded survives, the rule-based generator produces the
same JSON shape. Results are cached per user with a SHA-256 fingerprint of the facts, so Gemini is only called again
when the data change (the UI shows "Data changed" and a Regenerate button).

**Plain language.** The app first works out the numbers itself, writes them down as a numbered list, and only then
asks the AI to explain them. The AI has to point to the numbered lines it used, and the app throws away anything it
can't back up. If the AI is down, you still get a (more templated) summary.

---

## 2. AI Health Insights — what's shown

| Section | Meaning |
|---|---|
| Headline + status | One-line verdict: improving / stable / mixed / worsening |
| Key findings | 3–6 cards with severity (Act · Watch · Info · Positive). "Evidence" opens the exact facts |
| Connections | Links across data sources, e.g. BMI ↓ alongside HbA1c, ALT, LDL ↓ |
| Lifestyle signals | From wearables: steps, sleep, resting heart rate (last 30 vs previous 30 days) |
| What's specific to you | Where personal context changes interpretation (Asian BMI cut-offs, recalculated eGFR, gene results) |
| Questions for your doctor | Copyable list |
| Data gaps | What's missing for better answers |

---

## 3. Precision Medicine — calculators

Each card shows the value, category, a plain-language explanation, *why it is personal*, and under
"How this is calculated" the exact inputs (with dates), the formula and the source.

| Calculator | Formula / rule | Why it is "precision" | Source |
|---|---|---|---|
| **eGFR (CKD-EPI 2021)** | 142 × min(Scr/κ,1)^α × max(Scr/κ,1)^-1.2 × 0.9938^age × 1.012 (F); κ 0.7/0.9, α −0.241/−0.302 | Recomputed for the person's exact age and sex on each report date; compared with the lab's printed value (demo: lab 86 vs recalculated 95) | Inker, NEJM 2021; NKF |
| **FIB-4** | (age × AST) ÷ (platelets × √ALT); <1.3 low, >2.67 high, lower cut-off 2.0 if ≥65 | Age is in the formula; cut-off changes with age | Sterling 2006; AASLD 2023 |
| **10-year ASCVD risk** | Pooled Cohort Equations (sex/race-specific Cox models) | Uses age, sex, TC, HDL, SBP, BP treatment (auto-detected from medicines), smoking, diabetes (inferred from HbA1c ≥6.5 / meds); warns that it under-estimates risk in South Asians | Goff 2014; AHA/ACC 2018 |
| **IDRS** | age + waist + activity + parental diabetes (0–100; ≥60 high) | Built for Indian adults; Asian-Indian waist cut-offs | Mohan, JAPI 2005 |
| **BMI (ancestry-adjusted)** | Asian: 23–24.9 overweight, ≥25 obese; WHO: 25 / 30 | Same BMI 26.8 = "Overweight" (WHO) but "Obese" for Asians | Misra 2009; WHO 2004 |
| **Metabolic syndrome** | ≥3 of: waist (ancestry/sex cut-off), TG ≥150, HDL <40 M/<50 F, BP ≥130/85 or treated, FPG ≥100 or treated | Cut-offs depend on sex/ancestry; treatment counts | Alberti 2009 |
| Derived | Non-HDL, TG:HDL, HOMA-IR (if fasting insulin) | — | — |

Also on the tab:
- **Generic lab range vs your threshold** — e.g. hemoglobin anaemia cut-off by sex (WHO), HDL by sex, waist by ancestry, HbA1c goal depending on diabetes status.
- **Heart-risk enhancers** (2018 AHA/ACC): family history, LDL ≥160, CKD, metabolic syndrome, South Asian ancestry, TG ≥175, hs-CRP ≥2, Lp(a) ≥50, apoB ≥130, inflammatory disease — each marked present / absent / unknown.
- **Pharmacogenomics** — 14 genes, ~30 drugs from CPIC level-A guidance (clopidogrel–CYP2C19, statins–SLCO1B1, warfarin–CYP2C9/VKORC1, codeine/tramadol–CYP2D6, carbamazepine–HLA-B*15:02, abacavir–HLA-B*57:01, allopurinol–HLA-B*58:01, thiopurines–TPMT/NUDT15, fluoropyrimidines–DPYD, …). With no genotype on file it lists which one-time test would personalise the person's current medicines.
- **Medicine × lab safety checks** — metformin vs eGFR (FDA 2016) and B12; statins vs ALT/AST >3× ULN; ACE-i/ARB/MRA vs potassium; NSAIDs vs eGFR; levothyroxine vs TSH.
- **Personal monitoring plan** — e.g. HbA1c every 3 or 6 months (ADA), yearly UACR in diabetes, lipid panel after statin start, once-in-a-lifetime Lp(a), FibroScan if FIB-4 indeterminate.

**Plain language.** A normal lab report compares you with "average adults". This tab re-reads the same numbers
knowing who you are — your age, sex, Indian ancestry, family history, medicines and (optionally) your genes — using
formulas doctors already trust, and shows its working.

---

## 4. Health profile

Saved per user in the new `patient_profiles` table (created automatically on startup — no migration needed):
date of birth, sex, height, weight, waist, ancestry, smoking, alcohol, activity, parents with diabetes, family history
of premature heart disease, known conditions, BP-treatment override, and pharmacogenomic results. Date of birth and sex
are **suggested automatically** from the latest lab report header (regex, no AI).

---

## 5. API

| Method | Path | Returns |
|---|---|---|
| GET | `/profile/` | profile, suggestions from reports, allowed options (conditions, genes & result values) |
| PUT | `/profile/` | save profile (validated: enums, ranges, gene/result pairs) |
| GET | `/precision/report` | full deterministic precision report |
| GET | `/ai-insights/` | last insights + `is_stale` |
| POST | `/ai-insights/generate?force=false` | generate (Gemini → fallback), cached by data fingerprint |

New env var: `GEMINI_MODEL` (default `gemini-3.6-flash`).

---

## 6. Files

**Backend (new):** `app/services/biomarker_catalog.py`, `app/services/health_facts.py`, `app/services/precision_service.py`,
`app/services/pgx_rules.py`, `app/ai/insights_service.py`, `app/routers/profile.py`, `app/routers/precision.py`,
`app/routers/ai_insights.py`, `tests/test_precision.py`, `tests/test_insights.py`.
**Backend (changed):** `app/main.py` (3 routers), `app/models/models.py` (2 tables), `app/services/analytics_service.py` (A1 fix).
**Frontend (new):** `src/pages/AIPrecisionTab.jsx`, `src/components/ai/{SummaryCard,OverviewSection,RiskSection,MedicinesSection,PlanSection,ProfileModal,ui}.jsx`.
**Frontend (changed):** `src/pages/Dashboard.jsx` (tabs + label fixes).

---

## 7. Validation done

- `cd backend && pip install -r requirements-dev.txt && python -m pytest -q tests` → **39 passed**:
  - Pooled Cohort Equations reproduce the guideline's worked example (55 y, TC 213, HDL 50, SBP 120):
    2.1 % / 3.0 % / 5.3 % / 6.1 % (White F / AA F / White M / AA M; White M is 5.38 % unrounded — the paper rounds an intermediate sum).
  - CKD-EPI 2021 single-equation form equals the published piecewise form; KDIGO staging; FIB-4; IDRS points; BMI cut-offs.
  - Name matching (incl. the AST/fasting-glucose regression), unit conversion, PGx rules, AI grounding & fallback (Gemini mocked).
- End-to-end on `test_data/` (seeded without Gemini), hand-checked: eGFR 95.0 for a 44.3-year-old man with creatinine 1.0;
  FIB-4 0.72; IDRS 50 = 20+10+10+10; ASCVD 2.4 %; metabolic syndrome 3/5.
- `npm run build` passes; both tabs and the profile form were rendered in headless Chrome (dark + light theme) with no runtime errors.
- **Not tested here:** a live Gemini response (my environment cannot reach the Gemini API). The SDK call was checked to be
  well-formed, and the grounding/fallback logic is unit-tested with a mocked model. Run it once with your key.

## 8. Limitations
- Educational decision support only — not a medical device; calculators are population models.
- Pooled Cohort Equations were not derived in South Asian cohorts (the UI says so).
- PGx coverage is a curated subset of CPIC; brand-name matching covers common international brands only — enter generic names.
- Units the catalog does not recognise are skipped and listed, rather than guessed.
