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

    # Kidney Risk
    creatinine = get_val(["creatinine"])
    egfr = get_val(["egfr", "glomerular filtration"])
    bun = get_val(["bun", "blood urea nitrogen"])
    uric_acid = get_val(["uric acid"])

    kidney_score = 0
    kidney_factors = []
    if creatinine is not None:
        pts = 40 if creatinine >= 1.5 else (20 if creatinine >= 1.2 else 0)
        kidney_score += pts
        kidney_factors.append({"name": "Creatinine", "value": creatinine, "points": pts})
    if egfr is not None:
        pts = 40 if egfr < 60 else (20 if egfr < 90 else 0)
        kidney_score += pts
        kidney_factors.append({"name": "eGFR", "value": egfr, "points": pts})
    if bun is not None:
        pts = 20 if bun > 20 else 0
        kidney_score += pts
        kidney_factors.append({"name": "BUN", "value": bun, "points": pts})
    kidney_score = min(kidney_score, 100)

    # Liver Risk
    alt = get_val(["alt", "sgpt"])
    ast = get_val(["ast", "sgot"])
    alp = get_val(["alp", "alkaline phosphatase"])
    bilirubin = get_val(["bilirubin"])
    
    liver_score = 0
    liver_factors = []
    if alt is not None:
        pts = 30 if alt > 55 else (15 if alt > 40 else 0)
        liver_score += pts
        liver_factors.append({"name": "ALT", "value": alt, "points": pts})
    if ast is not None:
        pts = 30 if ast > 48 else (15 if ast > 40 else 0)
        liver_score += pts
        liver_factors.append({"name": "AST", "value": ast, "points": pts})
    if alp is not None:
        pts = 20 if alp > 147 else (10 if alp > 120 else 0)
        liver_score += pts
        liver_factors.append({"name": "ALP", "value": alp, "points": pts})
    liver_score = min(liver_score, 100)

    # Thyroid Risk
    tsh = get_val(["tsh", "thyroid stimulating hormone"])
    t4 = get_val(["free t4", "t4"])
    
    thyroid_score = 0
    thyroid_factors = []
    if tsh is not None:
        pts = 50 if (tsh > 4.5 or tsh < 0.4) else (20 if (tsh > 4.0 or tsh < 0.5) else 0)
        thyroid_score += pts
        thyroid_factors.append({"name": "TSH", "value": tsh, "points": pts})
    if t4 is not None:
        pts = 30 if (t4 > 1.8 or t4 < 0.8) else 0
        thyroid_score += pts
        thyroid_factors.append({"name": "Free T4", "value": t4, "points": pts})
    thyroid_score = min(thyroid_score, 100)

    # Anemia Risk
    hemoglobin = get_val(["hemoglobin", "hgb"])
    ferritin = get_val(["ferritin"])
    mcv = get_val(["mcv"])
    
    anemia_score = 0
    anemia_factors = []
    if hemoglobin is not None:
        pts = 50 if hemoglobin < 12.0 else (20 if hemoglobin < 13.5 else 0)
        anemia_score += pts
        anemia_factors.append({"name": "Hemoglobin", "value": hemoglobin, "points": pts})
    if ferritin is not None:
        pts = 30 if ferritin < 30 else 0
        anemia_score += pts
        anemia_factors.append({"name": "Ferritin", "value": ferritin, "points": pts})
    if mcv is not None:
        pts = 20 if mcv < 80 else 0
        anemia_score += pts
        anemia_factors.append({"name": "MCV", "value": mcv, "points": pts})
    anemia_score = min(anemia_score, 100)

    # Inflammation Risk
    crp = get_val(["crp", "c-reactive protein"])
    wbc = get_val(["wbc", "white blood cell"])
    
    inflammation_score = 0
    inflammation_factors = []
    if crp is not None:
        pts = 50 if crp > 3.0 else (20 if crp > 1.0 else 0)
        inflammation_score += pts
        inflammation_factors.append({"name": "CRP", "value": crp, "points": pts})
    if wbc is not None:
        pts = 30 if wbc > 11.0 else 0
        inflammation_score += pts
        inflammation_factors.append({"name": "WBC", "value": wbc, "points": pts})
    inflammation_score = min(inflammation_score, 100)

    return {
        "diabetes": {"label": "Diabetes Risk", "score": diabetes_score, "factors": diabetes_factors},
        "cardiovascular": {"label": "Cardio Risk", "score": cardio_score, "factors": cardio_factors},
        "kidney": {"label": "Kidney Risk", "score": kidney_score, "factors": kidney_factors},
        "liver": {"label": "Liver Risk", "score": liver_score, "factors": liver_factors},
        "thyroid": {"label": "Thyroid Risk", "score": thyroid_score, "factors": thyroid_factors},
        "anemia": {"label": "Anemia Risk", "score": anemia_score, "factors": anemia_factors},
        "inflammation": {"label": "Inflammation Risk", "score": inflammation_score, "factors": inflammation_factors},
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


def compute_correlations(biomarkers: list, selected_names: List[str] = None) -> dict:
    """Compute Pearson correlation matrix and top biomarker correlations."""
    import math

    def calculate_pearson(x_vals, y_vals):
        n = len(x_vals)
        if n < 3:
            return None
        mean_x = sum(x_vals) / n
        mean_y = sum(y_vals) / n
        var_x = sum((x - mean_x) ** 2 for x in x_vals)
        var_y = sum((y - mean_y) ** 2 for y in y_vals)
        if var_x <= 1e-9 or var_y <= 1e-9:
            return 0.0
        cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(x_vals, y_vals))
        r = cov / math.sqrt(var_x * var_y)
        return max(-1.0, min(1.0, r))

    # Group biomarkers by name and date
    biomarkers_by_name = defaultdict(dict)
    units_by_name = {}
    all_dates = set()

    for b in biomarkers:
        if not b.recorded_at or b.value is None:
            continue
        date_str = b.recorded_at.strftime("%Y-%m-%d")
        all_dates.add(date_str)
        units_by_name[b.name] = b.unit or ""
        # If multiple on same date, average them
        if date_str in biomarkers_by_name[b.name]:
            existing = biomarkers_by_name[b.name][date_str]
            biomarkers_by_name[b.name][date_str] = (existing + b.value) / 2.0
        else:
            biomarkers_by_name[b.name][date_str] = float(b.value)

    # Candidate biomarkers with >= 3 readings
    candidates = [
        name for name, dates in biomarkers_by_name.items()
        if len(dates) >= 3
    ]
    # Sort candidates by reading count descending
    candidates.sort(key=lambda n: len(biomarkers_by_name[n]), reverse=True)

    if not candidates:
        return {
            "biomarkers": [],
            "all_available_names": [],
            "matrix": {},
            "top_correlations": [],
            "total_reports_analyzed": len(all_dates),
        }

    # Decide which biomarkers form the matrix (limit to 12 for clean UI unless selected)
    if selected_names:
        valid_selected = [n for n in selected_names if n in biomarkers_by_name]
        active_names = valid_selected if valid_selected else candidates[:12]
    else:
        active_names = candidates[:12]

    # Compute correlation matrix
    matrix = {}
    for name_a in active_names:
        matrix[name_a] = {}
        for name_b in active_names:
            if name_a == name_b:
                matrix[name_a][name_b] = {
                    "r": 1.0,
                    "sample_size": len(biomarkers_by_name[name_a]),
                    "points": [
                        {"date": d, "x": v, "y": v}
                        for d, v in sorted(biomarkers_by_name[name_a].items())
                    ],
                }
            else:
                shared_dates = sorted(set(biomarkers_by_name[name_a].keys()) & set(biomarkers_by_name[name_b].keys()))
                if len(shared_dates) < 3:
                    matrix[name_a][name_b] = {"r": None, "sample_size": len(shared_dates), "points": []}
                else:
                    x_vals = [biomarkers_by_name[name_a][d] for d in shared_dates]
                    y_vals = [biomarkers_by_name[name_b][d] for d in shared_dates]
                    r = calculate_pearson(x_vals, y_vals)
                    points = [
                        {"date": d, "x": round(x, 2), "y": round(y, 2)}
                        for d, x, y in zip(shared_dates, x_vals, y_vals)
                    ]
                    matrix[name_a][name_b] = {
                        "r": round(r, 2) if r is not None else None,
                        "sample_size": len(shared_dates),
                        "points": points,
                    }

    # Compute top correlations across all candidates (not just active matrix)
    top_correlations = []
    seen_pairs = set()
    for i, name_a in enumerate(candidates):
        for name_b in candidates[i + 1:]:
            pair_key = tuple(sorted([name_a, name_b]))
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)

            shared_dates = sorted(set(biomarkers_by_name[name_a].keys()) & set(biomarkers_by_name[name_b].keys()))
            if len(shared_dates) < 3:
                continue

            x_vals = [biomarkers_by_name[name_a][d] for d in shared_dates]
            y_vals = [biomarkers_by_name[name_b][d] for d in shared_dates]
            r = calculate_pearson(x_vals, y_vals)
            if r is None or abs(r) < 0.35:
                continue

            # Classify relationship
            if r >= 0.7:
                rel = "Strong Positive"
                expl = f"When {name_a} increases, {name_b} shows a strong tendency to increase as well."
            elif r >= 0.35:
                rel = "Moderate Positive"
                expl = f"{name_a} and {name_b} tend to rise and fall together moderately."
            elif r <= -0.7:
                rel = "Strong Inverse"
                expl = f"When {name_a} increases, {name_b} tends to decrease significantly."
            else:
                rel = "Moderate Inverse"
                expl = f"{name_a} and {name_b} show a moderate inverse pattern."

            points = [
                {"date": d, "x": round(x, 2), "y": round(y, 2)}
                for d, x, y in zip(shared_dates, x_vals, y_vals)
            ]

            top_correlations.append({
                "biomarker_a": name_a,
                "unit_a": units_by_name.get(name_a, ""),
                "biomarker_b": name_b,
                "unit_b": units_by_name.get(name_b, ""),
                "r": round(r, 2),
                "sample_size": len(shared_dates),
                "relationship": rel,
                "explanation": expl,
                "points": points,
            })

    # Sort top correlations by absolute r descending
    top_correlations.sort(key=lambda c: abs(c["r"]), reverse=True)

    return {
        "biomarkers": [
            {"name": name, "unit": units_by_name.get(name, ""), "count": len(biomarkers_by_name[name])}
            for name in active_names
        ],
        "all_available_names": [
            {"name": name, "unit": units_by_name.get(name, ""), "count": len(biomarkers_by_name[name])}
            for name in candidates
        ],
        "matrix": matrix,
        "top_correlations": top_correlations[:15],
        "total_reports_analyzed": len(all_dates),
    }
