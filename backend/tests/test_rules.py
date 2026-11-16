"""Python replacements for Gemini: Health Insights summary and the diet plan, on the 8 sample reports."""
import glob
import os
import sys
from datetime import date, datetime

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.database import Base  # noqa: E402
from app.models.models import Biomarker, ManualLog, PatientProfile, Report, User  # noqa: E402
from app.services.diet_rules import build_diet_plan, detect_needs  # noqa: E402
from app.services.health_facts import load_context  # noqa: E402
from app.services.report_parser import parse_lab_report, read_pdf  # noqa: E402
from app.services.summary_rules import build_health_summary  # noqa: E402

SAMPLES = sorted(glob.glob(os.path.join(os.path.dirname(__file__), "..", "..", "test_data", "*.pdf")))
pytestmark = pytest.mark.skipif(not SAMPLES, reason="test_data PDFs not present")


@pytest.fixture(scope="module")
def db_user(tmp_path_factory):
    engine = create_engine(f"sqlite:///{tmp_path_factory.mktemp('r') / 'r.db'}")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    u = User(email="t@example.in", hashed_password="x")
    db.add(u)
    db.commit()
    for f in SAMPLES:
        text, tables = read_pdf(f)
        p = parse_lab_report(text, tables)
        r = Report(user_id=u.id, filename=os.path.basename(f), file_path=f, extracted_text=text)
        db.add(r)
        db.flush()
        when = datetime.strptime(p["report_date"], "%Y-%m-%d")
        for b in p["biomarkers"]:
            db.add(Biomarker(report_id=r.id, user_id=u.id, name=b["name"], value=float(b["value"]), unit=b["unit"],
                             ref_min=float(b["ref_min"]) if b["ref_min"] else None,
                             ref_max=float(b["ref_max"]) if b["ref_max"] else None, recorded_at=when))
    db.commit()
    yield db, u
    db.close()


def test_summary_matches_trends(db_user):
    db, u = db_user
    s = build_health_summary(load_context(db, u))
    assert s["method"] == "rules"
    assert set(s) >= {"overall_assessment", "important_changes", "key_improvements", "worsening_indicators", "risk_trends"}
    assert s["overall_assessment"].startswith("41 lab tests reviewed from 15 Sep 2025 to 10 Jul 2026")
    hba1c = next(x for x in s["key_improvements"] if x.startswith("HbA1c"))
    assert "8.6 → 5.9 %" in hba1c and "moving toward normal" in hba1c
    assert any(x.startswith("ALT (SGPT)") and "now within the normal range" in x for x in s["key_improvements"])
    assert s["worsening_indicators"] == []
    assert s["important_changes"][0].startswith("Vitamin D (25-OH) changed +343%")


def test_diet_plan_first_report_flags_each_problem(db_user):
    db, u = db_user
    ctx = load_context(db, u)
    for k in ctx.series:
        ctx.series[k] = ctx.series[k][:1]          # only the first (worst) report
    needs = [n["need"] for n in detect_needs(ctx)]
    assert needs == ["glucose", "lipids", "uric_acid", "vit_d", "liver", "bp", "weight"]
    plan = build_diet_plan(ctx)
    meals = plan["daily_plan"]["meals"]
    assert set(meals) == {"breakfast", "lunch", "snack", "dinner"}
    assert "seafood" not in str(meals)                               # high uric acid: fish meal excluded
    assert plan["daily_plan"]["macros"]["calories"] == 2000           # no profile -> default
    assert "HbA1c 8.6 %" in plan["summary_reasoning"] and plan["method"] == "rules"


def test_diet_plan_calories_from_profile_and_home_bp(db_user):
    db, u = db_user
    db.add(PatientProfile(user_id=u.id, date_of_birth=date(1982, 3, 12), sex="male", height_cm=172, weight_kg=80,
                          physical_activity="moderate"))
    db.add(ManualLog(user_id=u.id, log_type="blood_pressure", value=142, value2=88, unit="mmHg",
                     logged_at=datetime(2026, 8, 1)))
    db.commit()
    plan = build_diet_plan(load_context(db, u))
    # BMI 80/1.72² = 27.0 ≥ 23 -> deficit; resting = 10·80 + 6.25·172 − 5·age + 5
    assert "minus 500 kcal" in plan["summary_reasoning"]
    assert "blood pressure 142/88" in plan["summary_reasoning"]
    assert plan["daily_plan"]["meals"]["lunch"]["name"].startswith("Millet roti")   # low-salt + low-GI
    kcal = plan["daily_plan"]["macros"]["calories"]
    assert 1800 <= kcal <= 2400 and kcal % 50 == 0
