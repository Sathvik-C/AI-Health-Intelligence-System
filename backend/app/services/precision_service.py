"""Precision medicine engine (deterministic Python).

"Precision" here means: the same lab value is interpreted using *this* person's
age, sex, ancestry, family history, lifestyle, medicines and genotype, with
published, validated equations. Each output lists its inputs, the formula,
and the source, so it can be checked by hand.

Calculators
  * eGFR — CKD-EPI 2021 (race-free) creatinine equation      [Inker, NEJM 2021]
  * FIB-4 — liver fibrosis index                              [Sterling, Hepatology 2006]
  * 10-year ASCVD risk — Pooled Cohort Equations              [Goff, Circulation 2014]
  * IDRS — Indian Diabetes Risk Score                         [Mohan, JAPI 2005]
  * BMI with Asian-Indian cut-offs                            [Misra, JAPI 2009; WHO 2004]
  * Metabolic syndrome — harmonised criteria                  [Alberti, Circulation 2009]
  * HOMA-IR / non-HDL / TG:HDL                                (derived values)
Plus: personalised thresholds, ASCVD risk-enhancers (2018 AHA/ACC),
pharmacogenomics (CPIC) and drug–lab safety checks.
"""
from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Dict, List, Optional

from app.services import pgx_rules
from app.services.health_facts import PatientContext, Reading

SOURCES = {
    "ckd_epi_2021": {"label": "Inker LA et al. N Engl J Med 2021;385:1737-49 (CKD-EPI 2021); National Kidney Foundation",
                     "url": "https://www.kidney.org/professionals/ckd-epi-creatinine-equation-2021"},
    "kdigo": {"label": "KDIGO 2012/2024 CKD guideline — GFR categories G1–G5", "url": "https://kdigo.org/guidelines/ckd-evaluation-and-management/"},
    "fib4": {"label": "Sterling RK et al. Hepatology 2006;43:1317-25; AASLD 2023 MASLD guidance (cut-offs 1.3 / 2.67)",
             "url": "https://pubmed.ncbi.nlm.nih.gov/16729309/"},
    "pce": {"label": "Goff DC Jr et al. 2013 ACC/AHA Guideline on Assessment of Cardiovascular Risk. Circulation 2014;129:S49-73",
            "url": "https://pubmed.ncbi.nlm.nih.gov/24222018/"},
    "aha2018": {"label": "Grundy SM et al. 2018 AHA/ACC Guideline on the Management of Blood Cholesterol (risk-enhancing factors)",
                "url": "https://pubmed.ncbi.nlm.nih.gov/30586774/"},
    "idrs": {"label": "Mohan V et al. A simplified Indian Diabetes Risk Score. J Assoc Physicians India 2005;53:759-63",
             "url": "https://pubmed.ncbi.nlm.nih.gov/16334618/"},
    "asian_bmi": {"label": "Misra A et al. Consensus statement for diagnosis of obesity in Asian Indians. JAPI 2009; WHO Expert Consultation, Lancet 2004",
                  "url": "https://pubmed.ncbi.nlm.nih.gov/19582986/"},
    "mets": {"label": "Alberti KGMM et al. Harmonizing the Metabolic Syndrome. Circulation 2009;120:1640-5",
             "url": "https://pubmed.ncbi.nlm.nih.gov/19805654/"},
    "who_hb": {"label": "WHO haemoglobin cut-offs for anaemia (men <13 g/dL, non-pregnant women <12 g/dL)",
               "url": "https://www.who.int/publications/i/item/9789240088542"},
    "fda_metformin": {"label": "US FDA Drug Safety Communication (2016): metformin use with reduced kidney function",
                      "url": "https://www.fda.gov/drugs/drug-safety-and-availability/fda-drug-safety-communication-fda-revises-warnings-regarding-use-diabetes-medicine-metformin-certain"},
    "ada": {"label": "American Diabetes Association — Standards of Care in Diabetes (current edition)",
            "url": "https://diabetesjournals.org/care/issue/48/Supplement_1"},
    "cpic": {"label": "CPIC guidelines", "url": pgx_rules.CPIC_URL},
}

ASIAN = {"south_asian", "east_asian"}

ANTIHYPERTENSIVE_SUFFIXES = ("pril", "sartan", "olol", "dipine")
ANTIHYPERTENSIVE_NAMES = {"chlorthalidone", "hydrochlorothiazide", "indapamide", "spironolactone", "eplerenone",
                          "diltiazem", "verapamil", "clonidine", "prazosin", "hydralazine", "torsemide", "furosemide",
                          "moxonidine", "methyldopa", "carvedilol", "labetalol"}
GLUCOSE_LOWERING = {"metformin", "gliclazide", "glimepiride", "glipizide", "glibenclamide", "sitagliptin",
                    "vildagliptin", "teneligliptin", "linagliptin", "saxagliptin", "empagliflozin", "dapagliflozin",
                    "canagliflozin", "pioglitazone", "insulin", "semaglutide", "liraglutide", "dulaglutide",
                    "tirzepatide", "acarbose", "voglibose"}
STATINS = {"atorvastatin", "rosuvastatin", "simvastatin", "pravastatin", "pitavastatin", "lovastatin", "fluvastatin"}
NSAIDS = {"ibuprofen", "diclofenac", "naproxen", "aceclofenac", "etoricoxib", "celecoxib", "ketorolac", "meloxicam",
          "piroxicam", "indomethacin", "mefenamic"}
POTASSIUM_RAISING_SUFFIX = ("pril", "sartan")
POTASSIUM_RAISING_NAMES = {"spironolactone", "eplerenone", "finerenone"}


def _words(name: str) -> List[str]:
    import re
    return re.findall(r"[a-z]+", (name or "").lower())


def _matches(med: Dict, names=(), suffixes=()) -> bool:
    return any(w in names or w.endswith(tuple(suffixes)) for w in _words(med.get("drug_name", ""))) if suffixes \
        else any(w in names for w in _words(med.get("drug_name", "")))


def _r(v, nd=1):
    return None if v is None else round(v, nd)


def _input(label, value, unit, when=None, source="lab", note=None):
    d = {"label": label, "value": value, "unit": unit, "source": source}
    if when:
        d["date"] = when.isoformat() if hasattr(when, "isoformat") else when
    if note:
        d["note"] = note
    return d


def _unavailable(cid, name, missing, why=""):
    return {"id": cid, "name": name, "status": "insufficient_data", "missing": missing, "why": why}


# ---------------------------------------------------------------------------
# Inferred clinical flags (shown to the user with their basis)
# ---------------------------------------------------------------------------

def diabetes_status(ctx: PatientContext) -> Dict:
    conds = set((ctx.profile.known_conditions or []) if ctx.profile else [])
    if conds & {"type2_diabetes", "type1_diabetes", "diabetes"}:
        return {"value": True, "basis": "Recorded in your profile"}
    for r in ctx.series.get("hba1c", []):
        if r.value >= 6.5:
            return {"value": True, "basis": f"Inferred: HbA1c {r.value:.1f}% on {r.date} (≥6.5%)"}
    for r in ctx.series.get("fasting_glucose", []):
        if r.source == "lab" and r.value >= 126:
            return {"value": True, "basis": f"Inferred: fasting glucose {r.value:.0f} mg/dL on {r.date} (≥126)"}
    for m in ctx.medicines:
        if _matches(m, GLUCOSE_LOWERING):
            return {"value": True, "basis": f"Inferred from current medicine: {m['drug_name']}"}
    if ctx.series.get("hba1c") or ctx.series.get("fasting_glucose"):
        return {"value": False, "basis": "No diabetes-range HbA1c/fasting glucose in your records"}
    return {"value": None, "basis": "Unknown — no HbA1c or fasting glucose on record"}


def bp_treated(ctx: PatientContext) -> Dict:
    if ctx.profile and ctx.profile.on_bp_treatment is not None:
        return {"value": bool(ctx.profile.on_bp_treatment), "basis": "Recorded in your profile"}
    for m in ctx.medicines:
        if _matches(m, ANTIHYPERTENSIVE_NAMES, ANTIHYPERTENSIVE_SUFFIXES):
            return {"value": True, "basis": f"Inferred from current medicine: {m['drug_name']}"}
    return {"value": False, "basis": "No blood-pressure medicine in your current medicines list"}


# ---------------------------------------------------------------------------
# eGFR — CKD-EPI 2021
# ---------------------------------------------------------------------------

def ckd_epi_2021(scr_mg_dl: float, age: float, sex: str) -> float:
    female = sex == "female"
    kappa = 0.7 if female else 0.9
    alpha = -0.241 if female else -0.302
    ratio = scr_mg_dl / kappa
    egfr = 142 * (min(ratio, 1) ** alpha) * (max(ratio, 1) ** -1.200) * (0.9938 ** age)
    return egfr * 1.012 if female else egfr


def kdigo_stage(egfr: float) -> Dict:
    for lo, stage, label in [(90, "G1", "Normal or high"), (60, "G2", "Mildly decreased"),
                             (45, "G3a", "Mildly to moderately decreased"), (30, "G3b", "Moderately to severely decreased"),
                             (15, "G4", "Severely decreased")]:
        if egfr >= lo:
            return {"stage": stage, "label": label}
    return {"stage": "G5", "label": "Kidney failure range"}


def calc_egfr(ctx: PatientContext) -> Dict:
    name = "Kidney function — eGFR (CKD-EPI 2021)"
    missing = [m for m, ok in [("date of birth", ctx.profile and ctx.profile.date_of_birth),
                               ("sex", ctx.sex), ("creatinine result", ctx.series.get("creatinine"))] if not ok]
    if missing:
        return _unavailable("egfr", name, missing, "eGFR is calculated from creatinine, age and sex.")
    series = []
    for r in ctx.series["creatinine"]:
        age = ctx.age_on(r.date)
        if age is None or age < 18:
            continue
        val = ckd_epi_2021(r.value, age, ctx.sex)
        lab = next((e for e in ctx.series.get("egfr", []) if e.date == r.date), None)
        series.append({"date": r.date.isoformat(), "value": _r(val), "creatinine": _r(r.value, 2),
                       "lab_reported": _r(lab.value) if lab else None})
    if not series:
        return _unavailable("egfr", name, ["adult age at test date"], "Equation is validated for adults (≥18 y).")
    last_cr = ctx.series["creatinine"][-1]
    val = series[-1]["value"]
    st = kdigo_stage(val)
    lab = series[-1]["lab_reported"]
    note = None
    if lab is not None and abs(lab - val) >= 5:
        note = (f"Your lab printed {lab:.0f}; recalculating with CKD-EPI 2021 for your exact age and sex gives "
                f"{val:.0f}. Labs may use an older equation or a different age.")
    level = "ok" if val >= 90 else "watch" if val >= 60 else "act"
    return {
        "id": "egfr", "short": "eGFR", "name": name, "status": "ok", "value": val, "unit": "mL/min/1.73m²",
        "category": f"{st['stage']} · {st['label']}", "level": level,
        "inputs": [_input("Creatinine", _r(last_cr.value, 2), "mg/dL", last_cr.date),
                   _input("Age at test", _r(ctx.age_on(last_cr.date)), "years", source="profile"),
                   _input("Sex", ctx.sex, "", source="profile")],
        "formula": "142 × min(Scr/κ,1)^α × max(Scr/κ,1)^-1.200 × 0.9938^age × 1.012 [female]; κ=0.7 F / 0.9 M, α=-0.241 F / -0.302 M",
        "plain_language": "How well your kidneys filter blood, estimated from creatinine and adjusted for your age and sex. "
                          "Above 90 is normal; 60–89 is mildly reduced and only a concern if there are other kidney signs (like protein in urine).",
        "why_personal": "Uses your exact age and sex; the 2021 equation does not use race.",
        "note": note, "series": series, "sources": [SOURCES["ckd_epi_2021"], SOURCES["kdigo"]],
    }


# ---------------------------------------------------------------------------
# FIB-4
# ---------------------------------------------------------------------------

def fib4(age: float, ast: float, alt: float, platelets_10e9: float) -> float:
    return (age * ast) / (platelets_10e9 * math.sqrt(alt))


def calc_fib4(ctx: PatientContext) -> Dict:
    name = "Liver scarring risk — FIB-4"
    need = [("date of birth", ctx.profile and ctx.profile.date_of_birth), ("AST", ctx.series.get("ast")),
            ("ALT", ctx.series.get("alt")), ("platelet count", ctx.series.get("platelets"))]
    missing = [m for m, ok in need if not ok]
    if missing:
        return _unavailable("fib4", name, missing, "FIB-4 needs age, AST, ALT and platelets from the same period.")
    series = []
    for ast in ctx.series["ast"]:
        alt = ctx.value_on_or_before("alt", ast.date, 30)
        plt = ctx.value_on_or_before("platelets", ast.date, 30)
        age = ctx.age_on(ast.date)
        if alt and plt and age and alt.value > 0 and plt.value > 0:
            series.append({"date": ast.date.isoformat(), "value": _r(fib4(age, ast.value, alt.value, plt.value), 2),
                           "ast": ast.value, "alt": alt.value, "platelets": plt.value, "age": _r(age)})
    if not series:
        return _unavailable("fib4", name, ["AST, ALT and platelets measured within 30 days of each other"])
    last = series[-1]
    age = last["age"]
    low_cut = 2.0 if age >= 65 else 1.3
    v = last["value"]
    if v < low_cut:
        cat, level = "Low risk of advanced fibrosis", "ok"
    elif v > 2.67:
        cat, level = "High risk of advanced fibrosis", "act"
    else:
        cat, level = "Indeterminate", "watch"
    note = "FIB-4 is less reliable under age 35." if age < 35 else None
    return {
        "id": "fib4", "short": "FIB-4", "name": name, "status": "ok", "value": v, "unit": "", "category": cat, "level": level,
        "inputs": [_input("Age", age, "years", source="profile"), _input("AST", last["ast"], "U/L", last["date"]),
                   _input("ALT", last["alt"], "U/L", last["date"]),
                   _input("Platelets", last["platelets"], "×10⁹/L", last["date"])],
        "formula": f"(Age × AST) ÷ (Platelets × √ALT); <{low_cut} low, >2.67 high (age-adjusted lower cut-off ≥65 y = 2.0)",
        "plain_language": "Estimates the chance of significant liver scarring from routine blood tests. "
                          "Low means scarring is unlikely; indeterminate usually leads to a liver-stiffness scan (FibroScan).",
        "why_personal": "Your age is part of the formula, and the cut-off changes after 65.",
        "note": note, "series": series, "sources": [SOURCES["fib4"]],
    }


# ---------------------------------------------------------------------------
# Pooled Cohort Equations (10-year ASCVD risk)
# ---------------------------------------------------------------------------

PCE = {
    ("female", "white"): dict(ln_age=-29.799, ln_age_sq=4.884, ln_tc=13.540, ln_age_ln_tc=-3.114, ln_hdl=-13.578,
                              ln_age_ln_hdl=3.149, ln_tsbp=2.019, ln_age_ln_tsbp=0.0, ln_usbp=1.957,
                              ln_age_ln_usbp=0.0, smoker=7.574, ln_age_smoker=-1.665, diabetes=0.661,
                              s10=0.9665, mean=-29.18),
    ("female", "african"): dict(ln_age=17.114, ln_age_sq=0.0, ln_tc=0.940, ln_age_ln_tc=0.0, ln_hdl=-18.920,
                                ln_age_ln_hdl=4.475, ln_tsbp=29.291, ln_age_ln_tsbp=-6.432, ln_usbp=27.820,
                                ln_age_ln_usbp=-6.087, smoker=0.691, ln_age_smoker=0.0, diabetes=0.874,
                                s10=0.9533, mean=86.61),
    ("male", "white"): dict(ln_age=12.344, ln_age_sq=0.0, ln_tc=11.853, ln_age_ln_tc=-2.664, ln_hdl=-7.990,
                            ln_age_ln_hdl=1.769, ln_tsbp=1.797, ln_age_ln_tsbp=0.0, ln_usbp=1.764,
                            ln_age_ln_usbp=0.0, smoker=7.837, ln_age_smoker=-1.795, diabetes=0.658,
                            s10=0.9144, mean=61.18),
    ("male", "african"): dict(ln_age=2.469, ln_age_sq=0.0, ln_tc=0.302, ln_age_ln_tc=0.0, ln_hdl=-0.307,
                              ln_age_ln_hdl=0.0, ln_tsbp=1.916, ln_age_ln_tsbp=0.0, ln_usbp=1.809,
                              ln_age_ln_usbp=0.0, smoker=0.549, ln_age_smoker=0.0, diabetes=0.645,
                              s10=0.8954, mean=19.54),
}


def pooled_cohort_risk(age, sex, race, tc, hdl, sbp, treated, smoker, diabetic) -> float:
    c = PCE[(sex, "african" if race == "african" else "white")]
    la, lt, lh, ls = math.log(age), math.log(tc), math.log(hdl), math.log(sbp)
    s = (c["ln_age"] * la + c["ln_age_sq"] * la * la + c["ln_tc"] * lt + c["ln_age_ln_tc"] * la * lt
         + c["ln_hdl"] * lh + c["ln_age_ln_hdl"] * la * lh
         + (c["ln_tsbp"] * ls + c["ln_age_ln_tsbp"] * la * ls if treated else
            c["ln_usbp"] * ls + c["ln_age_ln_usbp"] * la * ls)
         + (c["smoker"] + c["ln_age_smoker"] * la if smoker else 0)
         + (c["diabetes"] if diabetic else 0))
    return 1 - c["s10"] ** math.exp(s - c["mean"])


def calc_ascvd(ctx: PatientContext, diab: Dict, bp: Dict) -> Dict:
    name = "10-year heart attack & stroke risk (Pooled Cohort Equations)"
    p = ctx.profile
    tc, hdl, sbp = ctx.latest("total_cholesterol"), ctx.latest("hdl"), ctx.latest("sbp")
    need = [("date of birth", p and p.date_of_birth), ("sex", ctx.sex), ("smoking status", p and p.smoking_status),
            ("total cholesterol", tc), ("HDL cholesterol", hdl), ("systolic blood pressure", sbp)]
    missing = [m for m, ok in need if not ok]
    if diab["value"] is None:
        missing.append("diabetes status (HbA1c or profile)")
    if missing:
        return _unavailable("ascvd", name, missing)
    age = ctx.age
    if not 40 <= age <= 79:
        return _unavailable("ascvd", name, [], f"Validated only for ages 40–79 (you are {age:.0f}).")
    race = p.ancestry or "other"
    risk = pooled_cohort_risk(age, ctx.sex, race, tc.value, hdl.value, sbp.value, bp["value"],
                              p.smoking_status == "current", diab["value"]) * 100
    if risk < 5:
        cat, level = "Low (<5%)", "ok"
    elif risk < 7.5:
        cat, level = "Borderline (5–7.4%)", "watch"
    elif risk < 20:
        cat, level = "Intermediate (7.5–19.9%)", "watch"
    else:
        cat, level = "High (≥20%)", "act"
    notes = []
    if race in ASIAN or race not in ("white", "european", "african"):
        notes.append("The equations were built in White and African-American cohorts; for other ancestries the "
                     "White equation is used. They tend to under-estimate risk in South Asians — the 2018 AHA/ACC "
                     "guideline lists South Asian ancestry as a risk-enhancing factor.")
    for lbl, val, lo, hi in [("Total cholesterol", tc.value, 130, 320), ("HDL", hdl.value, 20, 100),
                             ("Systolic BP", sbp.value, 90, 200)]:
        if not lo <= val <= hi:
            notes.append(f"{lbl} {val:.0f} is outside the equation's tested range ({lo}–{hi}); interpret with care.")
    return {
        "id": "ascvd", "short": "10-year ASCVD risk", "name": name, "status": "ok", "value": _r(risk), "unit": "%", "category": cat, "level": level,
        "inputs": [_input("Age", _r(age), "years", source="profile"), _input("Sex", ctx.sex, "", source="profile"),
                   _input("Total cholesterol", _r(tc.value, 0), "mg/dL", tc.date),
                   _input("HDL cholesterol", _r(hdl.value, 0), "mg/dL", hdl.date),
                   _input("Systolic BP", _r(sbp.value, 0), "mmHg", sbp.date, sbp.source),
                   _input("On BP treatment", bp["value"], "", source="inferred", note=bp["basis"]),
                   _input("Current smoker", p.smoking_status == "current", "", source="profile"),
                   _input("Diabetes", diab["value"], "", source="inferred", note=diab["basis"])],
        "formula": "Sex- and race-specific Cox model: risk = 1 − S10^exp(Σβx − mean)",
        "plain_language": "The chance of a heart attack or stroke in the next 10 years for someone with your numbers. "
                          "It is a population estimate, used to decide how strongly to treat cholesterol and blood pressure.",
        "why_personal": "Combines your age, sex, cholesterol, blood pressure, smoking, diabetes and treatment status.",
        "note": " ".join(notes) or None, "sources": [SOURCES["pce"], SOURCES["aha2018"]],
    }


# ---------------------------------------------------------------------------
# Indian Diabetes Risk Score
# ---------------------------------------------------------------------------

def idrs_score(age: float, sex: str, waist_cm: float, activity: str, parents_with_diabetes: int) -> Dict:
    age_pts = 0 if age < 35 else 20 if age < 50 else 30
    lo, hi = (80, 90) if sex == "female" else (90, 100)
    waist_pts = 0 if waist_cm < lo else 10 if waist_cm < hi else 20
    act_pts = {"vigorous": 0, "moderate": 10, "mild": 20, "sedentary": 30}[activity]
    fam_pts = {0: 0, 1: 10, 2: 20}[int(parents_with_diabetes)]
    total = age_pts + waist_pts + act_pts + fam_pts
    return {"total": total, "age": age_pts, "waist": waist_pts, "activity": act_pts, "family": fam_pts}


def calc_idrs(ctx: PatientContext, diab: Dict) -> Dict:
    name = "Indian Diabetes Risk Score (IDRS)"
    p = ctx.profile
    need = [("date of birth", p and p.date_of_birth), ("sex", ctx.sex), ("waist circumference", p and p.waist_cm),
            ("physical activity level", p and p.physical_activity),
            ("parents with diabetes", p is not None and p.parents_with_diabetes is not None)]
    missing = [m for m, ok in need if not ok]
    if missing:
        return _unavailable("idrs", name, missing, "A 4-question score validated in Indian adults.")
    sc = idrs_score(ctx.age, ctx.sex, p.waist_cm, p.physical_activity, p.parents_with_diabetes)
    t = sc["total"]
    cat, level = ("High risk (≥60)", "act") if t >= 60 else ("Moderate risk (30–50)", "watch") if t >= 30 \
        else ("Low risk (<30)", "ok")
    note = None
    if diab["value"]:
        level = "info"
        note = "You already have a diabetes history, so IDRS (a screening tool) is shown for reference only."
    w = ctx.wearable[-30:] if ctx.wearable else []
    if w:
        avg_active = sum(r.active_minutes for r in w) / len(w)
        note = (note + " " if note else "") + f"Your wearable shows ~{avg_active:.0f} active minutes/day over the last {len(w)} days — check that your activity answer matches."
    return {
        "id": "idrs", "short": "IDRS", "name": name, "status": "ok", "value": t, "unit": "/ 100", "category": cat, "level": level,
        "inputs": [_input("Age points", sc["age"], "", source="profile"),
                   _input("Waist points", sc["waist"], "", source="profile", note=f"waist {p.waist_cm:.0f} cm"),
                   _input("Activity points", sc["activity"], "", source="profile", note=p.physical_activity),
                   _input("Family history points", sc["family"], "", source="profile",
                          note=f"{p.parents_with_diabetes} parent(s) with diabetes")],
        "formula": "Age (<35:0, 35–49:20, ≥50:30) + waist (F <80/M <90:0; F 80–89/M 90–99:10; larger:20) + "
                   "activity (vigorous:0, moderate:10, mild:20, sedentary:30) + parents with diabetes (0/10/20)",
        "plain_language": "A quick screening score built for Indian adults. 60 or more means a high chance of having or "
                          "developing type 2 diabetes, so blood-sugar testing is worthwhile.",
        "why_personal": "Built and validated in Indian adults, with waist cut-offs suited to Asian Indians.",
        "note": note, "sources": [SOURCES["idrs"]],
    }


# ---------------------------------------------------------------------------
# BMI with ancestry-specific cut-offs
# ---------------------------------------------------------------------------

def bmi_category(bmi: float, asian: bool) -> str:
    if bmi < 18.5:
        return "Underweight"
    if asian:
        return "Normal" if bmi < 23 else "Overweight" if bmi < 25 else "Obese"
    return "Normal" if bmi < 25 else "Overweight" if bmi < 30 else "Obese"


def current_bmi(ctx: PatientContext) -> Optional[Dict]:
    p = ctx.profile
    weight = p.weight_kg if p and p.weight_kg else None
    wdate = p.updated_at.date() if (p and p.weight_kg and p.updated_at) else None
    if ctx.weight_logs:
        last = ctx.weight_logs[-1]
        if wdate is None or last["date"] >= wdate:
            weight, wdate = last["value"], last["date"]
    if p and p.height_cm and weight:
        return {"value": weight / (p.height_cm / 100) ** 2, "basis": f"height {p.height_cm:.0f} cm, weight {weight:.1f} kg",
                "date": wdate}
    lab = ctx.latest("bmi")
    if lab:
        return {"value": lab.value, "basis": f"BMI printed on your {lab.date} report", "date": lab.date}
    return None


def calc_bmi(ctx: PatientContext) -> Dict:
    name = "Body mass index — ancestry-specific cut-offs"
    b = current_bmi(ctx)
    if not b:
        return _unavailable("bmi", name, ["height and weight (profile) or a BMI on a report"])
    anc = ctx.profile.ancestry if ctx.profile else None
    asian = anc in ASIAN
    generic, personal = bmi_category(b["value"], False), bmi_category(b["value"], asian)
    level = {"Normal": "ok", "Overweight": "watch", "Obese": "watch", "Underweight": "watch"}[personal]
    note = None
    if anc is None:
        note = "Add your ancestry to apply Asian cut-offs if relevant."
    elif asian and generic != personal:
        note = f"By standard WHO cut-offs this is '{generic}', but for Asian adults the same BMI is classed '{personal}' because health risks start at lower BMI."
    return {
        "id": "bmi", "short": "BMI (ancestry-adjusted)", "name": name, "status": "ok", "value": _r(b["value"]), "unit": "kg/m²", "category": personal,
        "level": level, "inputs": [_input("Basis", b["basis"], "", b["date"], "profile")],
        "formula": "weight (kg) ÷ height (m)²; Asian: normal 18.5–22.9, overweight 23–24.9, obese ≥25. WHO general: 18.5–24.9 / 25–29.9 / ≥30",
        "plain_language": "Weight relative to height. People of Asian ancestry develop diabetes and heart disease at lower BMI, so lower cut-offs are used.",
        "why_personal": "Cut-offs depend on your ancestry." if anc else "Cut-offs depend on ancestry (not yet set).",
        "note": note, "sources": [SOURCES["asian_bmi"]],
    }


# ---------------------------------------------------------------------------
# Metabolic syndrome (harmonised definition)
# ---------------------------------------------------------------------------

def calc_metabolic_syndrome(ctx: PatientContext, diab: Dict, bp: Dict) -> Dict:
    name = "Metabolic syndrome check (harmonised 2009 criteria)"
    p, sex = ctx.profile, ctx.sex
    comps = []

    def add(label, present, detail):
        comps.append({"label": label, "present": present, "detail": detail})

    if p and p.waist_cm and sex:
        cut = (90 if sex == "male" else 80) if (p.ancestry in ASIAN) else (94 if sex == "male" else 80)
        add("Waist", p.waist_cm >= cut, f"{p.waist_cm:.0f} cm (cut-off ≥{cut} cm for your sex/ancestry)")
    else:
        add("Waist", None, "Needs waist, sex and ancestry in your profile")
    tg = ctx.latest("triglycerides")
    add("Triglycerides ≥150 mg/dL", (tg.value >= 150) if tg else None,
        f"{tg.value:.0f} mg/dL on {tg.date}" if tg else "No triglyceride result")
    hdl = ctx.latest("hdl")
    if hdl and sex:
        cut = 40 if sex == "male" else 50
        add(f"HDL <{cut} mg/dL", hdl.value < cut, f"{hdl.value:.0f} mg/dL on {hdl.date}")
    else:
        add("Low HDL", None, "Needs HDL result and sex")
    sbp, dbp = ctx.latest("sbp"), ctx.latest("dbp")
    if bp["value"]:
        add("Blood pressure ≥130/85 or treated", True, f"On treatment ({bp['basis']})")
    elif sbp:
        high = sbp.value >= 130 or (dbp is not None and dbp.value >= 85)
        add("Blood pressure ≥130/85 or treated", high,
            f"{sbp.value:.0f}/{dbp.value:.0f} mmHg on {sbp.date}" if dbp else f"{sbp.value:.0f} mmHg systolic")
    else:
        add("Blood pressure ≥130/85 or treated", None, "No blood pressure reading")
    fg = ctx.latest("fasting_glucose")
    on_glucose_drug = any(_matches(m, GLUCOSE_LOWERING) for m in ctx.medicines)
    if on_glucose_drug:
        add("Fasting glucose ≥100 mg/dL or treated", True, "On glucose-lowering medicine")
    else:
        add("Fasting glucose ≥100 mg/dL or treated", (fg.value >= 100) if fg else None,
            f"{fg.value:.0f} mg/dL on {fg.date}" if fg else "No fasting glucose result")
    present = sum(1 for c in comps if c["present"] is True)
    unknown = sum(1 for c in comps if c["present"] is None)
    if present >= 3:
        cat, level, status = f"Criteria met ({present}/5)", "watch", "ok"
    elif present + unknown >= 3:
        cat, level, status = f"{present}/5 present, {unknown} unknown — cannot rule out", "watch", "partial"
    else:
        cat, level, status = f"Not met ({present}/5)", "ok", "ok"
    return {"id": "metabolic_syndrome", "short": "Metabolic syndrome", "name": name, "status": status, "value": present, "unit": "/ 5",
            "category": cat, "level": level, "components": comps,
            "formula": "Any 3 of 5: large waist (ancestry-specific), TG ≥150, low HDL (<40 M / <50 F), BP ≥130/85 or treated, fasting glucose ≥100 or treated",
            "plain_language": "A cluster of five warning signs. Having three or more roughly doubles heart-disease risk and raises diabetes risk.",
            "why_personal": "Waist and HDL cut-offs depend on your sex and ancestry; treatment counts as a positive sign.",
            "sources": [SOURCES["mets"]]}


# ---------------------------------------------------------------------------
# Derived lipid / insulin values
# ---------------------------------------------------------------------------

def calc_derived(ctx: PatientContext) -> List[Dict]:
    out = []
    tc, hdl, tg = ctx.latest("total_cholesterol"), ctx.latest("hdl"), ctx.latest("triglycerides")
    if tc and hdl and tc.date == hdl.date:
        out.append({"id": "non_hdl", "label": "Non-HDL cholesterol", "value": _r(tc.value - hdl.value, 0), "unit": "mg/dL",
                    "date": tc.date.isoformat(),
                    "plain_language": "All the 'bad' cholesterol particles together (total minus HDL). Often a better risk marker than LDL alone, especially with high triglycerides."})
    if tg and hdl and tg.date == hdl.date and hdl.value > 0:
        out.append({"id": "tg_hdl", "label": "Triglyceride : HDL ratio", "value": _r(tg.value / hdl.value, 2), "unit": "",
                    "date": tg.date.isoformat(),
                    "plain_language": "A rough marker of insulin resistance — higher ratios go with more insulin resistance."})
    ins, fg = ctx.latest("fasting_insulin"), ctx.latest("fasting_glucose")
    if ins and fg and abs((ins.date - fg.date).days) <= 7:
        out.append({"id": "homa_ir", "label": "HOMA-IR (insulin resistance)", "value": _r(fg.value * ins.value / 405, 2),
                    "unit": "", "date": ins.date.isoformat(),
                    "plain_language": "Fasting glucose × fasting insulin ÷ 405. Higher means more insulin resistance; population cut-offs vary (commonly ~2–2.5)."})
    return out


# ---------------------------------------------------------------------------
# Personalised thresholds
# ---------------------------------------------------------------------------

def personalised_thresholds(ctx: PatientContext, diab: Dict, egfr_calc: Dict) -> List[Dict]:
    out, sex, p = [], ctx.sex, ctx.profile
    hb = ctx.latest("hemoglobin")
    if hb and sex:
        cut = 13.0 if sex == "male" else 12.0
        out.append({"marker": "Hemoglobin", "your_value": f"{hb.value:.1f} g/dL", "lab_range":
                    f"{hb.ref_min}–{hb.ref_max} g/dL" if hb.ref_min is not None else "—",
                    "personal_threshold": f"Anaemia if <{cut:.0f} g/dL ({sex})", "status": "below" if hb.value < cut else "ok",
                    "source": SOURCES["who_hb"]})
    hdl = ctx.latest("hdl")
    if hdl and sex:
        cut = 40 if sex == "male" else 50
        out.append({"marker": "HDL cholesterol", "your_value": f"{hdl.value:.0f} mg/dL",
                    "lab_range": f"{hdl.ref_min:.0f}–{hdl.ref_max:.0f} mg/dL" if hdl.ref_min is not None and hdl.ref_max is not None else "—",
                    "personal_threshold": f"Low if <{cut} mg/dL ({sex})", "status": "below" if hdl.value < cut else "ok",
                    "source": SOURCES["mets"]})
    if p and p.waist_cm and sex:
        asian = p.ancestry in ASIAN
        cut = (90 if sex == "male" else 80) if asian else (94 if sex == "male" else 80)
        out.append({"marker": "Waist circumference", "your_value": f"{p.waist_cm:.0f} cm", "lab_range": "not on lab reports",
                    "personal_threshold": f"Raised if ≥{cut} cm ({'Asian' if asian else 'Europid/other'} {sex})",
                    "status": "above" if p.waist_cm >= cut else "ok", "source": SOURCES["mets"]})
    a1c = ctx.latest("hba1c")
    if a1c:
        if diab["value"]:
            thr, status = "Treatment goal commonly <7.0% (individualised by your doctor)", "above" if a1c.value >= 7 else "ok"
        else:
            thr = "Normal <5.7%; prediabetes 5.7–6.4%; diabetes ≥6.5%"
            status = "ok" if a1c.value < 5.7 else "above"
        out.append({"marker": "HbA1c", "your_value": f"{a1c.value:.1f}%",
                    "lab_range": f"{a1c.ref_min}–{a1c.ref_max}%" if a1c.ref_min is not None else "—",
                    "personal_threshold": thr, "status": status, "source": SOURCES["ada"]})
    if egfr_calc.get("status") == "ok":
        last = egfr_calc["series"][-1]
        out.append({"marker": "eGFR", "your_value": f"{last['value']:.0f} (recalculated for you)",
                    "lab_range": f"{last['lab_reported']:.0f} printed by lab" if last.get("lab_reported") else "—",
                    "personal_threshold": "≥90 normal; 60–89 only significant with other kidney damage markers",
                    "status": "ok" if last["value"] >= 60 else "below", "source": SOURCES["ckd_epi_2021"]})
    return out


# ---------------------------------------------------------------------------
# ASCVD risk enhancers (2018 AHA/ACC)
# ---------------------------------------------------------------------------

def risk_enhancers(ctx: PatientContext, egfr_calc: Dict, mets: Dict) -> List[Dict]:
    p = ctx.profile
    out = []

    def add(label, present, detail):
        out.append({"label": label, "present": present, "detail": detail})

    fam = p.family_history_premature_ascvd if p else None
    add("Family history of premature heart disease (men <55, women <65)", fam,
        "From your profile" if fam is not None else "Not answered in profile")
    ldl = ctx.latest("ldl")
    add("LDL ≥160 mg/dL", (ldl.value >= 160) if ldl else None, f"Latest {ldl.value:.0f} mg/dL" if ldl else "No LDL result")
    if egfr_calc.get("status") == "ok":
        v = egfr_calc["value"]
        add("Chronic kidney disease (eGFR 15–59)", 15 <= v < 60, f"Recalculated eGFR {v:.0f}")
    else:
        add("Chronic kidney disease (eGFR 15–59)", None, "eGFR not computable")
    add("Metabolic syndrome", True if mets["status"] == "ok" and mets["value"] >= 3 else
        (False if mets["status"] == "ok" else None), mets["category"])
    anc = p.ancestry if p else None
    add("South Asian ancestry", (anc == "south_asian") if anc else None, "From your profile" if anc else "Not set")
    tg = ctx.latest("triglycerides")
    tg_hits = [r for r in ctx.series.get("triglycerides", []) if r.value >= 175]
    add("Persistently raised triglycerides (≥175 mg/dL)", (len(tg_hits) >= 2 and tg.value >= 175) if tg else None,
        f"{len(tg_hits)} reading(s) ≥175; latest {tg.value:.0f}" if tg else "No triglyceride result")
    crp = ctx.latest("crp")
    add("hs-CRP ≥2.0 mg/L", (crp.value >= 2.0) if crp else None, f"Latest {crp.value:.1f} mg/L" if crp else "Not measured")
    lpa = ctx.latest("lpa")
    add("Lipoprotein(a) ≥50 mg/dL", (lpa.value >= 50) if lpa else None,
        f"{lpa.value:.0f} mg/dL" if lpa else "Never measured — usually checked once in a lifetime")
    apob = ctx.latest("apob")
    add("ApoB ≥130 mg/dL", (apob.value >= 130) if apob else None, f"{apob.value:.0f} mg/dL" if apob else "Not measured")
    conds = set((p.known_conditions or []) if p else [])
    infl = conds & {"rheumatoid_arthritis", "psoriasis", "hiv", "lupus"}
    add("Chronic inflammatory condition (RA, psoriasis, lupus, HIV)", True if infl else (False if p and p.known_conditions is not None else None),
        ", ".join(sorted(infl)) if infl else "None recorded")
    return out


# ---------------------------------------------------------------------------
# Drug–lab safety checks
# ---------------------------------------------------------------------------

def drug_lab_checks(ctx: PatientContext, egfr_calc: Dict) -> List[Dict]:
    out = []
    egfr_val = egfr_calc.get("value") if egfr_calc.get("status") == "ok" else (
        ctx.latest("egfr").value if ctx.latest("egfr") else None)
    egfr_src = "recalculated eGFR" if egfr_calc.get("status") == "ok" else "lab eGFR"
    for m in ctx.medicines:
        name = m["drug_name"]
        if _matches(m, {"metformin"}):
            if egfr_val is not None:
                if egfr_val < 30:
                    out.append({"drug": name, "lab": f"{egfr_src} {egfr_val:.0f}", "severity": "high",
                                "message": "Metformin is contraindicated below eGFR 30.", "source": SOURCES["fda_metformin"]})
                elif egfr_val < 45:
                    out.append({"drug": name, "lab": f"{egfr_src} {egfr_val:.0f}", "severity": "moderate",
                                "message": "eGFR 30–44: starting metformin is not recommended; if already on it, the benefit/risk should be reassessed.",
                                "source": SOURCES["fda_metformin"]})
                else:
                    out.append({"drug": name, "lab": f"{egfr_src} {egfr_val:.0f}", "severity": "ok",
                                "message": "Kidney function is adequate for metformin.", "source": SOURCES["fda_metformin"]})
            b12 = ctx.latest("vitamin_b12")
            if b12 is None:
                out.append({"drug": name, "lab": "Vitamin B12 — not on record", "severity": "info",
                            "message": "Long-term metformin can lower B12; periodic B12 testing is recommended.", "source": SOURCES["ada"]})
            elif b12.value < 200:
                out.append({"drug": name, "lab": f"B12 {b12.value:.0f} pg/mL ({b12.date})", "severity": "moderate",
                            "message": "Low B12 while on metformin — discuss supplementation.", "source": SOURCES["ada"]})
        if _matches(m, STATINS):
            for key, label in (("alt", "ALT"), ("ast", "AST")):
                r = ctx.latest(key)
                if r and r.ref_max and r.value > 3 * r.ref_max:
                    out.append({"drug": name, "lab": f"{label} {r.value:.0f} U/L (>3× upper limit)", "severity": "moderate",
                                "message": "Liver enzyme >3× the upper limit while on a statin — discuss with your doctor.",
                                "source": SOURCES["aha2018"]})
        if _matches(m, POTASSIUM_RAISING_NAMES, POTASSIUM_RAISING_SUFFIX):
            k = ctx.latest("potassium")
            if k and k.value > 5.5:
                out.append({"drug": name, "lab": f"Potassium {k.value:.1f} ({k.date})", "severity": "high",
                            "message": "High potassium on a drug that raises potassium — needs prompt review.", "source": SOURCES["kdigo"]})
            elif k and k.value > 5.0:
                out.append({"drug": name, "lab": f"Potassium {k.value:.1f} ({k.date})", "severity": "moderate",
                            "message": "Potassium above 5.0 on a drug that raises potassium — recheck advised.", "source": SOURCES["kdigo"]})
        if _matches(m, NSAIDS) and egfr_val is not None and egfr_val < 60:
            sev = "high" if egfr_val < 30 else "moderate"
            out.append({"drug": name, "lab": f"{egfr_src} {egfr_val:.0f}", "severity": sev,
                        "message": "Painkillers of the NSAID type can harm kidneys; avoid long-term use with reduced eGFR.",
                        "source": SOURCES["kdigo"]})
        if _matches(m, {"levothyroxine", "thyroxine", "eltroxin", "thyronorm"}):
            t = ctx.latest("tsh")
            if t and t.ref_max is not None and t.ref_min is not None and not (t.ref_min <= t.value <= t.ref_max):
                out.append({"drug": name, "lab": f"TSH {t.value:.2f} ({t.date})", "severity": "moderate",
                            "message": "TSH outside the reference range on thyroid replacement — dose review may be needed.",
                            "source": None})
    return out


# ---------------------------------------------------------------------------
# Monitoring plan (deterministic baseline; the AI may add context)
# ---------------------------------------------------------------------------

def monitoring_plan(ctx: PatientContext, diab: Dict, calcs: Dict[str, Dict], pgx: Dict) -> List[Dict]:
    plan = []
    a1c = ctx.latest("hba1c")
    if diab["value"]:
        at_goal = a1c is not None and a1c.value < 7
        plan.append({"test": "HbA1c", "interval": "every 6 months" if at_goal else "every 3 months",
                     "why": "Diabetes history; ADA suggests twice a year when at goal, quarterly when not.",
                     "source": SOURCES["ada"]})
        if not ctx.series.get("uacr"):
            plan.append({"test": "Urine albumin-to-creatinine ratio (UACR)", "interval": "at least yearly",
                         "why": "Diabetes needs yearly kidney screening with eGFR and UACR; no UACR on record.",
                         "source": SOURCES["ada"]})
    elif a1c and 5.7 <= a1c.value < 6.5:
        plan.append({"test": "HbA1c or fasting glucose", "interval": "yearly",
                     "why": f"Latest HbA1c {a1c.value:.1f}% is in the prediabetes range.", "source": SOURCES["ada"]})
    idrs = calcs.get("idrs", {})
    if idrs.get("status") == "ok" and idrs["value"] >= 60 and not diab["value"]:
        plan.append({"test": "HbA1c / fasting glucose", "interval": "yearly",
                     "why": f"IDRS {idrs['value']} (high risk).", "source": SOURCES["idrs"]})
    fib = calcs.get("fib4", {})
    if fib.get("status") == "ok" and fib["level"] in ("watch", "act"):
        plan.append({"test": "Liver stiffness scan (FibroScan / VCTE)", "interval": "discuss at next visit",
                     "why": f"FIB-4 {fib['value']} is {fib['category'].lower()}.", "source": SOURCES["fib4"]})
    if any(_matches(m, STATINS) for m in ctx.medicines):
        plan.append({"test": "Lipid profile", "interval": "4–12 weeks after a start/dose change, then every 3–12 months",
                     "why": "On statin therapy (2018 AHA/ACC).", "source": SOURCES["aha2018"]})
    if not ctx.series.get("lpa"):
        plan.append({"test": "Lipoprotein(a)", "interval": "once", "why": "Inherited risk marker, never measured; a single test is enough.",
                     "source": SOURCES["aha2018"]})
    for opp in pgx.get("testing_opportunities", [])[:3]:
        plan.append({"test": f"{opp['gene']} genotype", "interval": "once (lifelong result)",
                     "why": f"Would personalise {opp['drug']}: {opp['why']}", "source": SOURCES["cpic"]})
    return plan


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

PROFILE_FIELDS = [("date_of_birth", "Date of birth"), ("sex", "Sex"), ("height_cm", "Height"), ("weight_kg", "Weight"),
                  ("waist_cm", "Waist"), ("ancestry", "Ancestry"), ("smoking_status", "Smoking"),
                  ("physical_activity", "Physical activity"), ("parents_with_diabetes", "Parents with diabetes"),
                  ("family_history_premature_ascvd", "Family heart history")]


def build_precision_report(ctx: PatientContext) -> Dict:
    p = ctx.profile
    missing_profile = [label for f, label in PROFILE_FIELDS if not p or getattr(p, f) is None]
    diab, bp = diabetes_status(ctx), bp_treated(ctx)
    egfr_c = calc_egfr(ctx)
    calcs = {"egfr": egfr_c, "fib4": calc_fib4(ctx), "ascvd": calc_ascvd(ctx, diab, bp),
             "idrs": calc_idrs(ctx, diab), "bmi": calc_bmi(ctx)}
    mets = calc_metabolic_syndrome(ctx, diab, bp)
    calcs["metabolic_syndrome"] = mets
    pgx = pgx_rules.evaluate(ctx.medicines, p.pgx_results if p else None)
    return {
        "generated_for": date.today().isoformat(),
        "profile_completeness": {"filled": len(PROFILE_FIELDS) - len(missing_profile), "total": len(PROFILE_FIELDS),
                                 "missing": missing_profile},
        "inferred": {"diabetes": diab, "bp_treated": bp},
        "age": _r(ctx.age), "sex": ctx.sex, "ancestry": p.ancestry if p else None,
        "calculators": list(calcs.values()),
        "derived": calc_derived(ctx),
        "personalised_thresholds": personalised_thresholds(ctx, diab, egfr_c),
        "risk_enhancers": risk_enhancers(ctx, egfr_c, mets),
        "pharmacogenomics": pgx,
        "drug_lab_checks": drug_lab_checks(ctx, egfr_c),
        "monitoring_plan": monitoring_plan(ctx, diab, calcs, pgx),
        "current_medicines": ctx.medicines,
        "unit_problems": ctx.unit_problems[:20],
        "disclaimer": "Educational decision-support only. Calculators are population models; they do not replace "
                      "clinical judgement. Never start, stop or change a medicine without your doctor.",
    }
