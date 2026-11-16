"""Health Insights summary written by Python (replaces the Gemini call in /summary/generate).

Uses the same trend engine as the AI Insights tab (health_facts.trend_summary): for every lab test it compares
the first and latest readings against the lab's own reference range. Output keeps the old JSON shape:
  overall_assessment, important_changes, key_improvements, worsening_indicators, risk_trends

Plain words: instead of asking an AI to read the numbers, the app compares each test's first and latest value
with the normal range printed on the report, and sorts the tests into "better", "worse" and "still out of range".
"""
from __future__ import annotations

from typing import Dict, List

from app.services.biomarker_catalog import CATALOG_BY_KEY
from app.services.health_facts import PatientContext, trend_summary


def _fmt(v) -> str:
    if v is None:
        return "—"
    v = float(v)
    return str(int(v)) if v.is_integer() else f"{v:.2f}".rstrip("0").rstrip(".")


def _date(iso: str) -> str:
    from datetime import date
    d = date.fromisoformat(iso)
    return d.strftime("%d %b %Y").lstrip("0")


def _range(t: Dict) -> str:
    lo, hi = t.get("ref_min"), t.get("ref_max")
    if lo is not None and hi is not None:
        return f"{_fmt(lo)}–{_fmt(hi)}"
    if hi is not None:
        return f"below {_fmt(hi)}"
    if lo is not None:
        return f"above {_fmt(lo)}"
    return "no range"


def build_health_summary(ctx: PatientContext) -> Dict:
    rows = []
    for key, readings in ctx.series.items():
        labs = [r for r in readings if r.source == "lab"]
        if not labs:
            continue
        t = trend_summary(labs)
        m = CATALOG_BY_KEY[key]
        rows.append((m, t))
    rows.sort(key=lambda mt: mt[0].label)

    def move(m, t) -> str:
        f, l = t["first"], t["latest"]
        return (f"{m.label}: {_fmt(f['value'])} → {_fmt(l['value'])} {m.unit} "
                f"({_date(f['date'])} → {_date(l['date'])}; normal {_range(t)})")

    improvements, worsening, risks, changes = [], [], [], []
    for m, t in rows:
        d = t["direction"]
        if d == "normalised":
            improvements.append(move(m, t) + " — now within the normal range")
        elif d == "improving":
            improvements.append(move(m, t) + " — still outside the range but moving toward normal")
        elif d == "worsening":
            worsening.append(move(m, t) + " — outside the range and moving further away")
        elif d == "newly_out_of_range":
            worsening.append(move(m, t) + " — was normal, now outside the range")
        elif d == "persistently_out_of_range":
            risks.append(move(m, t) + " — outside the range on every reading, roughly unchanged")
        elif d == "single_reading" and t["latest_status"] in ("above", "below"):
            l = t["latest"]
            risks.append(f"{m.label}: {_fmt(l['value'])} {m.unit} on {_date(l['date'])} is "
                         f"{'above' if t['latest_status'] == 'above' else 'below'} the normal range ({_range(t)}); "
                         "only one reading so far")

    multi = [(m, t) for m, t in rows if t["n"] >= 2 and t["pct_change"] is not None and t["pct_change"] != 0]
    multi.sort(key=lambda mt: abs(mt[1]["pct_change"]), reverse=True)
    for m, t in multi[:6]:
        changes.append(f"{m.label} changed {t['pct_change']:+.0f}% ({_fmt(t['first']['value'])} → "
                       f"{_fmt(t['latest']['value'])} {m.unit}) over {t['n']} readings")

    all_dates = sorted({t["first"]["date"] for _, t in rows} | {t["latest"]["date"] for _, t in rows})
    outside_now = [m.label for m, t in rows if t["latest_status"] in ("above", "below")]
    normalised = sum(1 for _, t in rows if t["direction"] == "normalised")
    if rows:
        span = f"from {_date(all_dates[0])} to {_date(all_dates[-1])}" if len(all_dates) > 1 else f"on {_date(all_dates[0])}"
        overall = (f"{len(rows)} lab tests reviewed {span}. {len(improvements)} improved ({normalised} of them are now "
                   f"normal) and {len(worsening)} got worse. On the latest report {len(outside_now)} "
                   f"{'is' if len(outside_now) == 1 else 'are'} outside the normal range"
                   + (f" ({', '.join(outside_now[:5])}{'…' if len(outside_now) > 5 else ''}). " if outside_now else ". "))
        if worsening:
            overall += "Worth discussing first with your doctor: " + ", ".join(
                s.split(":")[0] for s in worsening[:3]) + "."
        elif risks:
            overall += "Still needing attention: " + ", ".join(s.split(":")[0] for s in risks[:3]) + "."
        else:
            overall += "No test is moving in the wrong direction."
    else:
        overall = "No lab results yet. Upload a lab report to see your trends."
    return {"overall_assessment": overall, "important_changes": changes, "key_improvements": improvements,
            "worsening_indicators": worsening, "risk_trends": risks, "method": "rules"}
