"""Builds one normalised view of a patient's data for the AI Insights and
Precision Medicine features.

Everything here is deterministic Python (no AI). The AI layer only receives
the numbered "facts" produced here, and every AI statement must cite fact IDs,
so the UI can show the exact numbers behind each insight.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from statistics import mean
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.models import Biomarker, ManualLog, Medicine, PatientProfile, Report, WearableDaily
from app.services.biomarker_catalog import CATALOG_BY_KEY, canonical_key, to_canonical


@dataclass
class Reading:
    key: str
    name: str            # name as written on the report
    value: float         # canonical unit
    unit: str            # canonical unit
    date: date
    ref_min: Optional[float] = None
    ref_max: Optional[float] = None
    source: str = "lab"  # lab | manual_log

    def status(self) -> str:
        if self.ref_max is not None and self.value > self.ref_max:
            return "above"
        if self.ref_min is not None and self.value < self.ref_min:
            return "below"
        if self.ref_min is None and self.ref_max is None:
            return "no_range"
        return "in_range"

    def as_dict(self) -> Dict:
        return {"name": self.name, "value": round(self.value, 2), "unit": self.unit,
                "date": self.date.isoformat(), "source": self.source}


@dataclass
class PatientContext:
    user_id: int
    full_name: Optional[str]
    profile: Optional[PatientProfile]
    series: Dict[str, List[Reading]]
    unit_problems: List[str]
    medicines: List[Dict]
    wearable: List[WearableDaily]
    weight_logs: List[Dict]
    report_texts: List[str] = field(default_factory=list)
    today: date = field(default_factory=date.today)

    # ---- profile helpers -------------------------------------------------
    def age_on(self, on: date) -> Optional[float]:
        dob = self.profile.date_of_birth if self.profile else None
        if not dob:
            return None
        return (on - dob).days / 365.25

    @property
    def age(self) -> Optional[float]:
        return self.age_on(self.today)

    @property
    def sex(self) -> Optional[str]:
        return (self.profile.sex or None) if self.profile else None

    def latest(self, key: str) -> Optional[Reading]:
        s = self.series.get(key)
        return s[-1] if s else None

    def value_on_or_before(self, key: str, on: date, max_gap_days: int = 120) -> Optional[Reading]:
        best = None
        for r in self.series.get(key, []):
            if r.date <= on and (on - r.date).days <= max_gap_days:
                best = r
        return best


CURRENT_MED_GRACE_DAYS = 0


def _is_current(m: Medicine, today: date) -> bool:
    return m.end_date is None or m.end_date >= today - timedelta(days=CURRENT_MED_GRACE_DAYS)


def load_context(db: Session, user) -> PatientContext:
    uid = user.id
    profile = db.query(PatientProfile).filter(PatientProfile.user_id == uid).first()

    series: Dict[str, List[Reading]] = {}
    problems: List[str] = []
    for b in db.query(Biomarker).filter(Biomarker.user_id == uid).order_by(Biomarker.recorded_at.asc()).all():
        key = canonical_key(b.name)
        if not key or b.value is None or b.recorded_at is None:
            continue
        val, prob = to_canonical(key, b.value, b.unit)
        if val is None:
            problems.append(f"{b.name} ({b.recorded_at.date()}): {prob}")
            continue
        rmin = to_canonical(key, b.ref_min, b.unit)[0] if b.ref_min is not None else None
        rmax = to_canonical(key, b.ref_max, b.unit)[0] if b.ref_max is not None else None
        series.setdefault(key, []).append(Reading(key, b.name, val, CATALOG_BY_KEY[key].unit, b.recorded_at.date(),
                                                  rmin, rmax, "lab"))

    weight_logs = []
    for log in db.query(ManualLog).filter(ManualLog.user_id == uid).order_by(ManualLog.logged_at.asc()).all():
        d = (log.logged_at or datetime.utcnow()).date()
        if log.log_type == "blood_pressure":
            series.setdefault("sbp", []).append(Reading("sbp", "Blood pressure (home log)", log.value, "mmHg", d,
                                                        90, 120, "manual_log"))
            if log.value2:
                series.setdefault("dbp", []).append(Reading("dbp", "Blood pressure (home log)", log.value2, "mmHg", d,
                                                            60, 80, "manual_log"))
        elif log.log_type == "glucose":
            series.setdefault("fasting_glucose", []).append(
                Reading("fasting_glucose", "Fasting glucose (home log)", log.value, "mg/dL", d, 70, 99, "manual_log"))
        elif log.log_type == "weight":
            weight_logs.append({"value": log.value, "date": d})
        elif log.log_type == "pulse":
            series.setdefault("pulse", []).append(Reading("pulse", "Pulse (home log)", log.value, "bpm", d, 60, 100,
                                                          "manual_log"))
    for k in series:
        series[k].sort(key=lambda r: r.date)

    today = date.today()
    meds = [
        {"drug_name": m.drug_name, "dosage": m.dosage, "start_date": m.start_date.isoformat() if m.start_date else None,
         "end_date": m.end_date.isoformat() if m.end_date else None}
        for m in db.query(Medicine).filter(Medicine.user_id == uid).order_by(Medicine.start_date.asc()).all()
        if _is_current(m, today)
    ]
    wearable = (db.query(WearableDaily).filter(WearableDaily.user_id == uid)
                .order_by(WearableDaily.date.asc()).all())
    texts = [r.extracted_text for r in db.query(Report).filter(Report.user_id == uid)
             .order_by(Report.report_date.desc()).limit(3).all() if r.extracted_text]
    return PatientContext(uid, user.full_name, profile, series, problems, meds, wearable, weight_logs, texts, today)


# ---------------------------------------------------------------------------
# Trend maths
# ---------------------------------------------------------------------------

def slope_per_90_days(readings: List[Reading]) -> Optional[float]:
    if len(readings) < 2:
        return None
    t0 = readings[0].date
    xs = [(r.date - t0).days for r in readings]
    ys = [r.value for r in readings]
    mx, my = mean(xs), mean(ys)
    den = sum((x - mx) ** 2 for x in xs)
    if den == 0:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den * 90


def _distance_outside(r: Reading) -> float:
    if r.ref_max is not None and r.value > r.ref_max:
        return r.value - r.ref_max
    if r.ref_min is not None and r.value < r.ref_min:
        return r.ref_min - r.value
    return 0.0


def trend_summary(readings: List[Reading]) -> Dict:
    first, last = readings[0], readings[-1]
    change = last.value - first.value
    pct = (change / first.value * 100) if first.value else None
    d0, d1 = _distance_outside(first), _distance_outside(last)
    if len(readings) < 2:
        direction = "single_reading"
    elif d0 > 0 and d1 == 0:
        direction = "normalised"
    elif d0 == 0 and d1 > 0:
        direction = "newly_out_of_range"
    elif d1 > 0 and d1 < d0 * 0.9:
        direction = "improving"
    elif d1 > 0 and d1 > d0 * 1.1:
        direction = "worsening"
    elif d1 > 0:
        direction = "persistently_out_of_range"
    else:
        direction = "in_range"
    return {
        "first": first.as_dict(), "latest": last.as_dict(), "n": len(readings),
        "change": round(change, 2), "pct_change": round(pct, 1) if pct is not None else None,
        "slope_per_90d": (lambda s: round(s, 3) if s is not None else None)(slope_per_90_days(readings)),
        "latest_status": last.status(), "direction": direction,
        "ref_min": last.ref_min, "ref_max": last.ref_max,
    }


# ---------------------------------------------------------------------------
# Wearables
# ---------------------------------------------------------------------------

def wearable_summary(rows: List[WearableDaily], window: int = 30) -> Optional[Dict]:
    if not rows:
        return None
    end = rows[-1].date
    recent = [r for r in rows if r.date > end - timedelta(days=window)]
    prior = [r for r in rows if end - timedelta(days=2 * window) < r.date <= end - timedelta(days=window)]

    def avg(rs, attr):
        vals = [getattr(r, attr) for r in rs if getattr(r, attr) is not None]
        return round(mean(vals), 1) if vals else None

    metrics = {}
    for attr, label, unit in [("steps", "Daily steps", "steps"), ("active_minutes", "Active minutes", "min/day"),
                              ("exercise_minutes", "Exercise minutes", "min/day"),
                              ("sleep_hours", "Sleep", "h/night"), ("deep_sleep_hours", "Deep sleep", "h/night"),
                              ("resting_heart_rate", "Resting heart rate", "bpm")]:
        cur, prev = avg(recent, attr), avg(prior, attr)
        metrics[attr] = {"label": label, "unit": unit, "recent_avg": cur, "prior_avg": prev,
                         "change": round(cur - prev, 1) if cur is not None and prev is not None else None}
    return {"window_days": window, "end_date": end.isoformat(), "recent_days": len(recent),
            "prior_days": len(prior), "metrics": metrics,
            "pct_days_7000_steps": round(100 * sum(1 for r in recent if r.steps >= 7000) / len(recent), 0)
            if recent else None}


# ---------------------------------------------------------------------------
# Profile suggestions parsed from report text (no AI)
# ---------------------------------------------------------------------------

_DOB = re.compile(r"(?:Date of Birth|DOB)\s*[:\-]\s*(\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{4})", re.I)
_AGE_SEX = re.compile(r"Age\s*/\s*(?:Sex|Gender)\s*[:\-]\s*(\d{1,3})\s*(?:years|yrs|y)?\s*/\s*(Male|Female|M|F)\b", re.I)
_SEX = re.compile(r"\b(?:Sex|Gender)\s*[:\-]\s*(Male|Female|M|F)\b", re.I)


def suggest_profile(texts: List[str]) -> Dict:
    out: Dict = {}
    for t in texts:
        if "date_of_birth" not in out:
            m = _DOB.search(t)
            if m:
                raw = m.group(1).replace("/", "-").replace(" ", "-")
                for fmt in ("%d-%b-%Y", "%d-%B-%Y", "%d-%m-%Y"):
                    try:
                        out["date_of_birth"] = datetime.strptime(raw, fmt).date().isoformat()
                        break
                    except ValueError:
                        pass
        if "sex" not in out:
            m = _AGE_SEX.search(t) or _SEX.search(t)
            if m:
                s = m.groups()[-1].lower()
                out["sex"] = "male" if s.startswith("m") else "female"
    if out:
        out["source"] = "Parsed from your most recent lab report header"
    return out
