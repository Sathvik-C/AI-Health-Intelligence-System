import numpy as np
from typing import List
from datetime import datetime, timedelta
from collections import defaultdict


def forecast_biomarker(biomarkers: list) -> dict:
    """Linear regression forecast for the next 3 data points."""
    dates = [b.recorded_at.timestamp() for b in biomarkers]
    values = [b.value for b in biomarkers]

    x = np.array(dates)
    y = np.array(values)

    # Normalize x
    x_min = x.min()
    x_norm = x - x_min

    # Linear regression
    coeffs = np.polyfit(x_norm, y, 1)
    slope, intercept = coeffs

    # Generate 3 future points
    last_date = biomarkers[-1].recorded_at
    avg_gap = (x[-1] - x[0]) / max(len(x) - 1, 1)
    future_points = []
    for i in range(1, 4):
        future_ts = x[-1] + avg_gap * i - x_min
        predicted_value = slope * future_ts + intercept
        future_date = last_date + timedelta(seconds=avg_gap * i)
        future_points.append({
            "date": future_date.isoformat(),
            "value": round(predicted_value, 2),
        })

    # Threshold crossing warning
    ref_max = next((b.ref_max for b in reversed(biomarkers) if b.ref_max), None)
    ref_min = next((b.ref_min for b in reversed(biomarkers) if b.ref_min), None)
    warning = None
    if ref_max:
        for fp in future_points:
            if fp["value"] > ref_max:
                warning = f"Forecast suggests value may exceed upper reference limit ({ref_max})"
                break
    if ref_min and not warning:
        for fp in future_points:
            if fp["value"] < ref_min:
                warning = f"Forecast suggests value may drop below lower reference limit ({ref_min})"
                break

    return {
        "historical": [{"date": b.recorded_at.isoformat(), "value": b.value} for b in biomarkers],
        "forecast": future_points,
        "slope": round(slope, 6),
        "warning": warning,
    }


def compute_risk_scores(biomarkers: list) -> dict:
    """Compute diabetes risk score and cardiovascular risk score."""
    # Get latest value for each biomarker name
    latest = {}
    for b in biomarkers:
        if b.name not in latest or b.recorded_at > latest[b.name].recorded_at:
            latest[b.name] = b

    def get_val(names):
        for n in names:
            for key in latest:
                if n.lower() in key.lower():
                    return latest[key].value
        return None

    # Diabetes Risk
    hba1c = get_val(["hba1c", "hemoglobin a1c"])
    fasting_glucose = get_val(["fasting glucose", "glucose"])

    diabetes_score = 0
    diabetes_factors = []
    if hba1c is not None:
        if hba1c >= 6.5:
            pts = 50
        elif hba1c >= 5.7:
            pts = 30
        else:
            pts = 0
        diabetes_score += pts
        diabetes_factors.append({"name": "HbA1c", "value": hba1c, "points": pts})

    if fasting_glucose is not None:
        if fasting_glucose >= 126:
            pts = 50
        elif fasting_glucose >= 100:
            pts = 30
        else:
            pts = 0
        diabetes_score += pts
        diabetes_factors.append({"name": "Fasting Glucose", "value": fasting_glucose, "points": pts})

    diabetes_score = min(diabetes_score, 100)

    # Cardio Risk
    ldl = get_val(["ldl"])
    hdl = get_val(["hdl"])
    triglycerides = get_val(["triglyceride"])
    bp_systolic = get_val(["systolic", "blood pressure"])

    cardio_score = 0
    cardio_factors = []
    if ldl is not None:
        pts = 30 if ldl >= 160 else (20 if ldl >= 130 else 10 if ldl >= 100 else 0)
        cardio_score += pts
        cardio_factors.append({"name": "LDL", "value": ldl, "points": pts})
    if hdl is not None:
        pts = 20 if hdl < 40 else (10 if hdl < 60 else 0)
        cardio_score += pts
        cardio_factors.append({"name": "HDL", "value": hdl, "points": pts})
    if triglycerides is not None:
        pts = 25 if triglycerides >= 200 else (15 if triglycerides >= 150 else 0)
        cardio_score += pts
        cardio_factors.append({"name": "Triglycerides", "value": triglycerides, "points": pts})
    if bp_systolic is not None:
        pts = 25 if bp_systolic >= 140 else (15 if bp_systolic >= 130 else 0)
        cardio_score += pts
        cardio_factors.append({"name": "BP Systolic", "value": bp_systolic, "points": pts})

    cardio_score = min(cardio_score, 100)

    return {
        "diabetes": {"score": diabetes_score, "factors": diabetes_factors},
        "cardiovascular": {"score": cardio_score, "factors": cardio_factors},
    }


def detect_anomalies(biomarkers: list) -> list:
    """Z-score based anomaly detection per biomarker type."""
    grouped = defaultdict(list)
    for b in biomarkers:
        grouped[b.name].append(b)

    anomalies = []
    for name, items in grouped.items():
        if len(items) < 3:
            continue
        values = np.array([b.value for b in items])
        mean = np.mean(values)
        std = np.std(values)
        if std == 0:
            continue
        for b in items:
            z = abs((b.value - mean) / std)
            if z > 2.5:
                anomalies.append({
                    "biomarker_id": b.id,
                    "name": name,
                    "value": b.value,
                    "z_score": round(z, 2),
                    "recorded_at": b.recorded_at.isoformat(),
                    "severity": "high" if z > 3 else "medium",
                })

    return anomalies
