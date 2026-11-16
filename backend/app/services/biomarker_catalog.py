"""Canonical biomarker catalog: name matching + unit normalisation.

Why this exists
---------------
Lab reports (and Gemini's extraction of them) name the same test in many ways:
"SGOT (AST)", "AST", "Aspartate Aminotransferase"... The old substring lookup
(`"ast" in name`) also matched "Fasting Glucose" (f-AST-ing) and read the
glucose value as AST. This module matches whole *tokens* against known aliases
and rejects names that carry extra, unrelated words ("Non-HDL", "Urine
Creatinine", "Mean Corpuscular Hemoglobin").

Matching rule
-------------
1. Normalise: lowercase, "haem" -> "hem", non-alphanumerics -> spaces.
2. For every alias of every canonical marker, the alias tokens must appear as a
   contiguous run inside the name tokens.
3. Every *leftover* name token must be noise ("serum", "plasma", ...) or a token
   that belongs to the same marker's aliases (e.g. "SGPT (ALT)" -> leftover
   "alt" is an ALT alias token). Otherwise the alias is rejected.
4. The longest matching alias wins (most tokens); ties go to catalog order.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, Dict, Iterable, List, Optional, Tuple

NOISE_TOKENS = {"serum", "plasma", "s", "level", "levels", "test", "value", "result", "venous", "whole"}


@dataclass(frozen=True)
class MarkerDef:
    key: str
    label: str
    unit: str  # canonical unit used by calculators
    aliases: Tuple[str, ...]
    # unit (normalised) -> converter to canonical unit
    conversions: Dict[str, Callable[[float], float]] = field(default_factory=dict)
    # plausible range in canonical unit (used when the unit string is missing)
    plausible: Optional[Tuple[float, float]] = None


def _same(x: float) -> float:
    return x


MG_DL_GLUCOSE = {"mg/dl": _same, "mmol/l": lambda v: v * 18.016}
MG_DL_CHOL = {"mg/dl": _same, "mmol/l": lambda v: v * 38.67}

CATALOG: Tuple[MarkerDef, ...] = (
    MarkerDef("hba1c", "HbA1c", "%", ("hba1c", "hb a1c", "a1c", "hemoglobin a1c", "glycated hemoglobin",
                                        "glycosylated hemoglobin", "glycohemoglobin"),
              {"%": _same, "mmol/mol": lambda v: v / 10.929 + 2.15}, (3.0, 20.0)),
    MarkerDef("fasting_glucose", "Fasting glucose", "mg/dL",
              ("fasting glucose", "fasting blood glucose", "fasting plasma glucose", "fasting blood sugar", "fbs",
               "fpg", "glucose fasting", "fbg"), MG_DL_GLUCOSE, (30, 700)),
    MarkerDef("pp_glucose", "Post-prandial glucose", "mg/dL",
              ("post prandial glucose", "postprandial glucose", "post prandial blood sugar", "ppbs", "pp glucose",
               "glucose pp", "ppbg"), MG_DL_GLUCOSE, (30, 900)),
    MarkerDef("random_glucose", "Random glucose", "mg/dL", ("random glucose", "random blood sugar", "rbs"),
              MG_DL_GLUCOSE, (30, 900)),
    MarkerDef("glucose", "Glucose", "mg/dL", ("glucose", "blood glucose", "blood sugar"), MG_DL_GLUCOSE, (30, 900)),
    MarkerDef("fasting_insulin", "Fasting insulin", "uIU/mL", ("fasting insulin", "insulin fasting", "insulin"),
              {"uiu/ml": _same, "miu/l": _same, "uu/ml": _same, "pmol/l": lambda v: v / 6.0}, (0.5, 300)),
    MarkerDef("total_cholesterol", "Total cholesterol", "mg/dL",
              ("total cholesterol", "cholesterol total", "cholesterol"), MG_DL_CHOL, (50, 600)),
    MarkerDef("ldl", "LDL cholesterol", "mg/dL",
              ("ldl", "ldl c", "ldl cholesterol", "low density lipoprotein", "low density lipoprotein cholesterol",
               "ldl direct", "ldl calculated", "direct ldl"), MG_DL_CHOL, (10, 500)),
    MarkerDef("hdl", "HDL cholesterol", "mg/dL",
              ("hdl", "hdl c", "hdl cholesterol", "high density lipoprotein", "high density lipoprotein cholesterol",
               "direct hdl"), MG_DL_CHOL, (5, 200)),
    MarkerDef("non_hdl", "Non-HDL cholesterol", "mg/dL", ("non hdl", "non hdl cholesterol"), MG_DL_CHOL, (20, 500)),
    MarkerDef("vldl", "VLDL cholesterol", "mg/dL", ("vldl", "vldl cholesterol"), MG_DL_CHOL, (1, 300)),
    MarkerDef("triglycerides", "Triglycerides", "mg/dL", ("triglycerides", "triglyceride", "tg"),
              {"mg/dl": _same, "mmol/l": lambda v: v * 88.57}, (10, 5000)),
    MarkerDef("lpa", "Lipoprotein(a)", "mg/dL", ("lipoprotein a", "lp a", "lpa"),
              {"mg/dl": _same, "nmol/l": lambda v: v / 2.5}, (0, 500)),
    MarkerDef("apob", "Apolipoprotein B", "mg/dL", ("apolipoprotein b", "apo b", "apob"),
              {"mg/dl": _same, "g/l": lambda v: v * 100}, (10, 400)),
    MarkerDef("mchc", "MCHC", "g/dL", ("mchc", "mean corpuscular hemoglobin concentration"), {"g/dl": _same}),
    MarkerDef("mch", "MCH", "pg", ("mch", "mean corpuscular hemoglobin"), {"pg": _same}),
    MarkerDef("mcv", "MCV", "fL", ("mcv", "mean corpuscular volume"), {"fl": _same}, (40, 150)),
    MarkerDef("hemoglobin", "Hemoglobin", "g/dL", ("hemoglobin", "hb", "hgb"),
              {"g/dl": _same, "g/l": lambda v: v / 10, "gm/dl": _same, "gm%": _same, "g%": _same}, (3, 25)),
    MarkerDef("hematocrit", "Hematocrit", "%", ("hematocrit", "hct", "pcv", "packed cell volume"), {"%": _same}),
    MarkerDef("platelets", "Platelets", "10^9/L", ("platelets", "platelet", "platelet count", "plt"),
              {"10^9/l": _same, "x10^9/l": _same, "10^3/ul": _same, "x10^3/ul": _same, "k/ul": _same,
               "thou/ul": _same, "thou/mm3": _same, "10^3/mm3": _same, "lakhs/cumm": lambda v: v * 100,
               "lakh/cumm": lambda v: v * 100, "lakhs/ul": lambda v: v * 100, "lakhs/mm3": lambda v: v * 100,
               "/cumm": lambda v: v / 1000, "/ul": lambda v: v / 1000, "/mm3": lambda v: v / 1000,
               "cells/ul": lambda v: v / 1000}, (5, 2000)),
    MarkerDef("wbc", "WBC count", "10^9/L",
              ("wbc", "wbc count", "white blood cell count", "white blood cells", "total leucocyte count",
               "total leukocyte count", "tlc", "leukocytes", "leucocytes", "total wbc count"),
              {"10^9/l": _same, "k/ul": _same, "10^3/ul": _same, "x10^3/ul": _same, "thou/ul": _same,
               "/cumm": lambda v: v / 1000, "/ul": lambda v: v / 1000, "cells/cumm": lambda v: v / 1000},
              (0.5, 200)),
    MarkerDef("rbc", "RBC count", "10^12/L", ("rbc", "rbc count", "red blood cell count", "red blood cells"),
              {"m/ul": _same, "10^6/ul": _same, "10^12/l": _same, "million/cumm": _same}),
    MarkerDef("ferritin", "Ferritin", "ng/mL", ("ferritin",), {"ng/ml": _same, "ug/l": _same}, (1, 5000)),
    MarkerDef("iron", "Iron", "ug/dL", ("iron", "serum iron"), {"ug/dl": _same, "mcg/dl": _same}),
    MarkerDef("tibc", "TIBC", "ug/dL", ("tibc", "total iron binding capacity"), {"ug/dl": _same, "mcg/dl": _same}),
    MarkerDef("creatinine", "Creatinine", "mg/dL", ("creatinine", "creat"),
              {"mg/dl": _same, "umol/l": lambda v: v / 88.4, "micromol/l": lambda v: v / 88.4}, (0.1, 20)),
    MarkerDef("egfr", "eGFR (lab reported)", "mL/min/1.73m2",
              ("egfr", "estimated gfr", "estimated glomerular filtration rate", "glomerular filtration rate", "gfr",
               "egfr ckd epi", "egfr mdrd", "egfr cr"),
              {"ml/min/1.73m2": _same, "ml/min/1.73m²": _same, "ml/min": _same, "ml/min/1.73 m2": _same}, (1, 200)),
    MarkerDef("bun", "BUN", "mg/dL", ("bun", "blood urea nitrogen", "urea nitrogen"), {"mg/dl": _same}),
    MarkerDef("urea", "Urea", "mg/dL", ("urea", "blood urea"), {"mg/dl": _same, "mmol/l": lambda v: v * 6.006}),
    MarkerDef("uric_acid", "Uric acid", "mg/dL", ("uric acid", "urate"),
              {"mg/dl": _same, "umol/l": lambda v: v / 59.48}),
    MarkerDef("uacr", "Urine albumin/creatinine ratio", "mg/g",
              ("urine albumin creatinine ratio", "uacr", "albumin creatinine ratio", "microalbumin creatinine ratio",
               "acr"), {"mg/g": _same, "mg/mmol": lambda v: v * 8.84}),
    MarkerDef("alt", "ALT (SGPT)", "U/L", ("alt", "sgpt", "alanine aminotransferase", "alanine transaminase"),
              {"u/l": _same, "iu/l": _same}, (1, 5000)),
    MarkerDef("ast", "AST (SGOT)", "U/L", ("ast", "sgot", "aspartate aminotransferase", "aspartate transaminase"),
              {"u/l": _same, "iu/l": _same}, (1, 5000)),
    MarkerDef("alp", "Alkaline phosphatase", "U/L", ("alkaline phosphatase", "alp"), {"u/l": _same, "iu/l": _same}),
    MarkerDef("ggt", "GGT", "U/L", ("ggt", "gamma gt", "gamma glutamyl transferase", "ggtp"),
              {"u/l": _same, "iu/l": _same}),
    MarkerDef("bilirubin_total", "Total bilirubin", "mg/dL", ("total bilirubin", "bilirubin total", "bilirubin"),
              {"mg/dl": _same, "umol/l": lambda v: v / 17.1}),
    MarkerDef("albumin", "Albumin", "g/dL", ("albumin",), {"g/dl": _same, "g/l": lambda v: v / 10}),
    MarkerDef("total_protein", "Total protein", "g/dL", ("total protein", "protein total"), {"g/dl": _same}),
    MarkerDef("sodium", "Sodium", "mmol/L", ("sodium", "na"), {"meq/l": _same, "mmol/l": _same}),
    MarkerDef("potassium", "Potassium", "mmol/L", ("potassium", "k"), {"meq/l": _same, "mmol/l": _same}, (1, 10)),
    MarkerDef("tsh", "TSH", "mIU/L", ("tsh", "thyroid stimulating hormone"),
              {"miu/l": _same, "uiu/ml": _same, "mu/l": _same}),
    MarkerDef("free_t4", "Free T4", "ng/dL", ("free t4", "ft4", "t4 free", "free thyroxine"),
              {"ng/dl": _same, "pmol/l": lambda v: v / 12.87}),
    MarkerDef("vitamin_d", "Vitamin D (25-OH)", "ng/mL",
              ("vitamin d", "vit d", "25 oh vitamin d", "25 hydroxy vitamin d", "vitamin d 25 oh", "vitamin d3",
               "25 oh d"), {"ng/ml": _same, "nmol/l": lambda v: v / 2.496}),
    MarkerDef("vitamin_b12", "Vitamin B12", "pg/mL", ("vitamin b12", "b12", "vit b12", "cobalamin", "cyanocobalamin"),
              {"pg/ml": _same, "pmol/l": lambda v: v * 1.355}),
    MarkerDef("crp", "CRP / hs-CRP", "mg/L",
              ("crp", "hscrp", "hs crp", "c reactive protein", "high sensitivity crp",
               "high sensitivity c reactive protein"), {"mg/l": _same, "mg/dl": lambda v: v * 10}, (0, 500)),
    MarkerDef("esr", "ESR", "mm/hr", ("esr", "erythrocyte sedimentation rate"), {"mm/hr": _same, "mm/h": _same}),
    MarkerDef("sbp", "Systolic BP", "mmHg",
              ("bp systolic", "systolic", "systolic bp", "systolic blood pressure", "sbp"), {"mmhg": _same}, (60, 260)),
    MarkerDef("dbp", "Diastolic BP", "mmHg",
              ("bp diastolic", "diastolic", "diastolic bp", "diastolic blood pressure", "dbp"), {"mmhg": _same},
              (30, 160)),
    MarkerDef("bmi", "BMI", "kg/m2", ("bmi", "body mass index"), {"kg/m2": _same, "kg/m²": _same}, (10, 80)),
    MarkerDef("pulse", "Pulse", "bpm", ("pulse rate", "pulse", "heart rate"), {"bpm": _same, "/min": _same}),
)

CATALOG_BY_KEY: Dict[str, MarkerDef] = {m.key: m for m in CATALOG}


def _tokens(text: str) -> List[str]:
    text = (text or "").lower().replace("haem", "hem").replace("leuco", "leuko")
    text = text.replace("μ", "u").replace("µ", "u")
    return [t for t in re.split(r"[^a-z0-9]+", text) if t]


_ALIAS_TOKENS: Dict[str, List[List[str]]] = {m.key: [_tokens(a) for a in m.aliases] for m in CATALOG}
_MARKER_TOKENS: Dict[str, set] = {k: {t for a in v for t in a} for k, v in _ALIAS_TOKENS.items()}


def _find_run(hay: List[str], needle: List[str]) -> int:
    n = len(needle)
    for i in range(len(hay) - n + 1):
        if hay[i:i + n] == needle:
            return i
    return -1


def canonical_key(name: str) -> Optional[str]:
    """Return the canonical marker key for a lab test name, or None if unknown."""
    toks = _tokens(name)
    if not toks:
        return None
    best: Tuple[int, int, Optional[str]] = (0, 0, None)  # (alias_len, -catalog_index, key)
    for idx, marker in enumerate(CATALOG):
        for alias in _ALIAS_TOKENS[marker.key]:
            pos = _find_run(toks, alias)
            if pos < 0:
                continue
            leftover = toks[:pos] + toks[pos + len(alias):]
            if all(t in NOISE_TOKENS or t in _MARKER_TOKENS[marker.key] or t.isdigit() for t in leftover):
                cand = (len(alias), -idx, marker.key)
                if cand[:2] > best[:2]:
                    best = cand
    return best[2]


def _norm_unit(unit: Optional[str]) -> str:
    u = (unit or "").strip().lower().replace("μ", "u").replace("µ", "u").replace(" ", "")
    u = u.replace("×", "x").replace("cu.mm", "cumm").replace("/cmm", "/cumm")
    return u


def to_canonical(key: str, value: float, unit: Optional[str]) -> Tuple[Optional[float], Optional[str]]:
    """Convert a value to the canonical unit. Returns (value, problem)."""
    marker = CATALOG_BY_KEY.get(key)
    if marker is None or value is None:
        return None, "unknown marker"
    u = _norm_unit(unit)
    if not u:
        if marker.plausible and marker.plausible[0] <= value <= marker.plausible[1]:
            return float(value), None
        return None, f"no unit given for {marker.label}"
    conv = marker.conversions.get(u)
    if conv is None:
        # tolerate e.g. "mg/dl." or "mg/dL (calc)"
        for known, fn in marker.conversions.items():
            if u.startswith(known):
                conv = fn
                break
    if conv is None:
        if _norm_unit(marker.unit) == u:
            return float(value), None
        return None, f"unit '{unit}' for {marker.label} not recognised"
    return float(conv(value)), None


def group_by_canonical(biomarkers: Iterable) -> Dict[str, List]:
    """Group ORM Biomarker rows (or similar objects) by canonical key, oldest first."""
    out: Dict[str, List] = {}
    for b in biomarkers:
        key = canonical_key(getattr(b, "name", ""))
        if key:
            out.setdefault(key, []).append(b)
    for key in out:
        out[key].sort(key=lambda r: r.recorded_at)
    return out
