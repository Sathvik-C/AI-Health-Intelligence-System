"""Validation tests for the precision-medicine calculators and helpers.

Run from backend/:  python -m pytest -q tests
Reference values come from the original publications (see each test).
"""
import math
import os
import sys
from datetime import date
from types import SimpleNamespace as NS

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest  # noqa: E402

from app.services import pgx_rules  # noqa: E402
from app.services.biomarker_catalog import canonical_key, to_canonical  # noqa: E402
from app.services.precision_service import (  # noqa: E402
    bmi_category, ckd_epi_2021, fib4, idrs_score, kdigo_stage, pooled_cohort_risk,
)


# --- Pooled Cohort Equations --------------------------------------------------
# Goff DC Jr et al., 2013 ACC/AHA risk assessment guideline, worked example:
# age 55, TC 213 mg/dL, HDL 50 mg/dL, untreated SBP 120, non-smoker, no diabetes
# -> White women 2.1%, African-American women 3.0%, White men 5.3%, African-American men 6.1%.
@pytest.mark.parametrize("sex,race,expected", [
    ("female", "white", 2.1), ("female", "african", 3.0), ("male", "white", 5.3), ("male", "african", 6.1),
])
def test_pce_matches_guideline_example(sex, race, expected):
    # The guideline's worked example rounds the intermediate sum (White men: printed 60.69, exact 60.6995),
    # which moves the White-male result from 5.38% to the printed 5.3%; hence a ±0.1 point tolerance.
    risk = pooled_cohort_risk(55, sex, race, 213, 50, 120, False, False, False) * 100
    assert abs(risk - expected) <= 0.1


def test_pce_risk_rises_with_smoking_and_diabetes():
    base = pooled_cohort_risk(55, "male", "white", 213, 50, 120, False, False, False)
    assert pooled_cohort_risk(55, "male", "white", 213, 50, 120, False, True, False) > base
    assert pooled_cohort_risk(55, "male", "white", 213, 50, 120, False, False, True) > base


# --- CKD-EPI 2021 ---------------------------------------------------------------
# Single-equation form (NKF) must equal the published piecewise form:
#   F, Scr<=0.7: 142*1.012*(Scr/0.7)^-0.241*0.9938^age ; F, Scr>0.7: ... ^-1.200
#   M, Scr<=0.9: 142*(Scr/0.9)^-0.302*0.9938^age      ; M, Scr>0.9: ... ^-1.200
@pytest.mark.parametrize("scr,age,sex", [(0.5, 30, "female"), (1.1, 60, "female"), (0.8, 45, "male"),
                                         (1.4, 70, "male"), (0.7, 50, "female"), (0.9, 50, "male")])
def test_ckd_epi_2021_piecewise(scr, age, sex):
    k, a = (0.7, -0.241) if sex == "female" else (0.9, -0.302)
    exp = a if scr <= k else -1.200
    expected = 142 * (scr / k) ** exp * 0.9938 ** age * (1.012 if sex == "female" else 1)
    assert math.isclose(ckd_epi_2021(scr, age, sex), expected, rel_tol=1e-9)


def test_ckd_epi_reference_point():
    # At Scr == kappa the creatinine terms are 1: eGFR = 142 * 0.9938^age (*1.012 F)
    assert math.isclose(ckd_epi_2021(0.9, 40, "male"), 142 * 0.9938 ** 40)
    assert math.isclose(ckd_epi_2021(0.7, 40, "female"), 142 * 0.9938 ** 40 * 1.012)


def test_kdigo_stages():
    assert [kdigo_stage(v)["stage"] for v in (95, 75, 50, 35, 20, 10)] == ["G1", "G2", "G3a", "G3b", "G4", "G5"]


# --- FIB-4 -----------------------------------------------------------------------
def test_fib4_arithmetic():
    # (50 * 40) / (200 * sqrt(36)) = 2000 / 1200
    assert math.isclose(fib4(50, 40, 36, 200), 2000 / 1200)


# --- IDRS (Mohan 2005) ------------------------------------------------------------
def test_idrs_points():
    assert idrs_score(30, "male", 85, "vigorous", 0)["total"] == 0
    assert idrs_score(40, "male", 95, "moderate", 1)["total"] == 20 + 10 + 10 + 10
    assert idrs_score(55, "female", 92, "sedentary", 2)["total"] == 30 + 20 + 30 + 20  # maximum 100
    assert idrs_score(49.9, "female", 79.9, "mild", 0)["total"] == 20 + 0 + 20 + 0


# --- BMI cut-offs -----------------------------------------------------------------
def test_bmi_asian_vs_who():
    assert bmi_category(24.0, asian=False) == "Normal"
    assert bmi_category(24.0, asian=True) == "Overweight"
    assert bmi_category(26.8, asian=True) == "Obese"
    assert bmi_category(26.8, asian=False) == "Overweight"


# --- Biomarker name matching (regression for the old substring bug) ----------------
@pytest.mark.parametrize("name,key", [
    ("Fasting Glucose", "fasting_glucose"), ("SGOT (AST)", "ast"), ("SGPT (ALT)", "alt"),
    ("Glycated Hemoglobin (HbA1c)", "hba1c"), ("Hemoglobin", "hemoglobin"), ("VLDL", "vldl"),
    ("LDL Cholesterol", "ldl"), ("Non-HDL Cholesterol", "non_hdl"), ("HDL Cholesterol", "hdl"),
    ("Mean Corpuscular Hemoglobin", "mch"), ("Urine Creatinine", None), ("BUN/Creatinine Ratio", None),
    ("eGFR (CKD-EPI)", "egfr"), ("Vitamin D (25-OH)", "vitamin_d"), ("Platelet Count", "platelets"),
])
def test_canonical_names(name, key):
    assert canonical_key(name) == key


def test_unit_conversions():
    assert to_canonical("platelets", 2.42, "lakhs/cumm")[0] == pytest.approx(242)
    assert to_canonical("creatinine", 88.4, "µmol/L")[0] == pytest.approx(1.0)
    assert to_canonical("hba1c", 48, "mmol/mol")[0] == pytest.approx(6.54, abs=0.01)
    assert to_canonical("ast", 20, "furlongs")[0] is None


def test_risk_scores_no_longer_read_glucose_as_ast():
    from app.services.analytics_service import compute_risk_scores
    d = date(2026, 7, 10)
    rows = [NS(name=n, value=v, unit=u, recorded_at=d) for n, v, u in [
        ("Fasting Glucose", 92, "mg/dL"), ("SGOT (AST)", 20, "U/L"), ("SGPT (ALT)", 26, "U/L"),
        ("Glycated Hemoglobin (HbA1c)", 5.9, "%"), ("Hemoglobin", 14.8, "g/dL")]]
    rs = compute_risk_scores(rows)
    ast = next(f for f in rs["liver"]["factors"] if f["name"] == "AST")
    hb = next(f for f in rs["anemia"]["factors"] if f["name"] == "Hemoglobin")
    assert ast["value"] == 20 and hb["value"] == 14.8


# --- Pharmacogenomics --------------------------------------------------------------
def test_pgx_flags_and_opportunities():
    meds = [{"drug_name": "Clopidogrel 75mg"}, {"drug_name": "Atorvastatin"}, {"drug_name": "Metformin"}]
    res = pgx_rules.evaluate(meds, {"CYP2C19": "poor_metabolizer"})
    assert res["interactions"][0]["severity"] == "high" and res["interactions"][0]["gene"] == "CYP2C19"
    assert any(o["gene"] == "SLCO1B1" for o in res["testing_opportunities"])
    assert not any(o["generic"] == "metformin" for o in res["testing_opportunities"])


def test_pgx_brand_names():
    assert pgx_rules.generic_name("Plavix") == "clopidogrel"
    assert pgx_rules.generic_name("Tab. Tegretol CR 200") == "carbamazepine"
    assert pgx_rules.generic_name("Telmisartan 40") is None
