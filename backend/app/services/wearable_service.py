import csv
import io
import json
import random
from datetime import date, datetime, timedelta
from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from app.models.models import WearableDaily


def _parse_date_flexible(val: Any) -> date:
    """Parse multiple date string representations into a datetime.date."""
    if isinstance(val, (date, datetime)):
        return val if isinstance(val, date) else val.date()
    s = str(val).strip()
    if not s:
        raise ValueError("Empty date string")
    
    # Try ISO format first (e.g., 2026-08-15 or 2026-08-15T12:00:00Z)
    if "T" in s:
        s = s.split("T")[0]
    
    formats = [
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%Y/%m/%d",
        "%b %d, %Y",
        "%d %b %Y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date format: '{val}'. Expected YYYY-MM-DD or DD/MM/YYYY.")


def _safe_float(val: Any, default: float = 0.0) -> float:
    if val is None or val == "":
        return default
    try:
        # Strip commas or units like 'km', 'hrs', 'bpm', 'kcal'
        cleaned = "".join(c for c in str(val) if c.isdigit() or c in ".-")
        return float(cleaned) if cleaned else default
    except (ValueError, TypeError):
        return default


def _safe_int(val: Any, default: int = 0) -> int:
    return int(round(_safe_float(val, float(default))))


def parse_wearable_file(content_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
    """
    Parse wearable data from CSV or JSON format.
    Supports exports from Apple Health, Fitbit, Garmin, Google Fit, Whoop, or custom tabular files.
    """
    filename_lower = filename.lower()
    text = content_bytes.decode("utf-8-sig", errors="replace")

    records: List[Dict[str, Any]] = []

    if filename_lower.endswith(".json"):
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                # Check common wrapper keys: records, data, daily, days
                for key in ["records", "data", "daily", "days", "activities"]:
                    if key in data and isinstance(data[key], list):
                        data = data[key]
                        break
            if not isinstance(data, list):
                raise ValueError("JSON file must contain an array of daily wearable records.")
            raw_rows = data
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON file format: {str(e)}")
    else:
        # Assume CSV / TSV
        delimiter = "\t" if "\t" in text.splitlines()[0] else ","
        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        raw_rows = list(reader)

    if not raw_rows:
        raise ValueError("The uploaded file does not contain any data rows.")

    for idx, row in enumerate(raw_rows):
        if not isinstance(row, dict):
            continue

        # Case-insensitive column resolution
        lower_row = {str(k).strip().lower(): v for k, v in row.items() if k is not None}

        # 1. Date extraction
        date_val = None
        for k in ["date", "timestamp", "datetime", "day", "time", "recorded_at"]:
            if k in lower_row and lower_row[k]:
                try:
                    date_val = _parse_date_flexible(lower_row[k])
                    break
                except ValueError:
                    pass

        if not date_val:
            # Skip row if date is missing/invalid
            continue

        # 2. Steps
        steps = None
        for k in ["steps", "step_count", "total_steps", "steps_count"]:
            if k in lower_row and lower_row[k] != "":
                steps = _safe_int(lower_row[k])
                break
        if steps is None:
            steps = 7500

        # 3. Distance (km)
        distance = None
        for k in ["distance_km", "distance", "distance (km)", "total_distance"]:
            if k in lower_row and lower_row[k] != "":
                distance = _safe_float(lower_row[k])
                break
        if distance is None:
            distance = round(max(steps * 0.00075, 1.0), 2)

        # 4. Active minutes
        active_mins = None
        for k in ["active_minutes", "active_mins", "active minutes", "active_time", "very_active_minutes"]:
            if k in lower_row and lower_row[k] != "":
                active_mins = _safe_int(lower_row[k])
                break
        if active_mins is None:
            active_mins = int(max(20, min(180, round(steps / 160))))

        # 5. Calories burned
        cals = None
        for k in ["calories_burned", "calories", "calories burned", "total_calories", "kcal", "active_calories"]:
            if k in lower_row and lower_row[k] != "":
                cals = _safe_int(lower_row[k])
                break
        if cals is None:
            cals = int(1700 + steps * 0.04)

        # 6. Sleep hours
        sleep_h = None
        for k in ["sleep_hours", "sleep", "sleep (hrs)", "sleep_duration", "total_sleep_hours"]:
            if k in lower_row and lower_row[k] != "":
                val = _safe_float(lower_row[k])
                # If value is in minutes (e.g. 420 mins), convert to hours
                sleep_h = round(val / 60.0, 2) if val > 24 else round(val, 2)
                break
        if sleep_h is None or sleep_h <= 0:
            sleep_h = 7.2

        deep_h = _safe_float(lower_row.get("deep_sleep_hours") or lower_row.get("deep_sleep"), round(sleep_h * 0.22, 2))
        rem_h = _safe_float(lower_row.get("rem_sleep_hours") or lower_row.get("rem_sleep"), round(sleep_h * 0.21, 2))
        light_h = _safe_float(lower_row.get("light_sleep_hours") or lower_row.get("light_sleep"), round(max(0.0, sleep_h - deep_h - rem_h), 2))

        # 7. Heart rate
        rhr = None
        for k in ["resting_heart_rate", "resting_hr", "rhr", "resting heart rate", "resting_heartrate"]:
            if k in lower_row and lower_row[k] != "":
                rhr = _safe_int(lower_row[k])
                break
        if rhr is None or rhr < 40 or rhr > 180:
            rhr = 68

        avg_hr = _safe_int(lower_row.get("average_heart_rate") or lower_row.get("avg_hr") or lower_row.get("heart_rate"), rhr + 8)
        max_hr = _safe_int(lower_row.get("max_heart_rate") or lower_row.get("max_hr"), avg_hr + 40)

        # 8. Activity type & exercise
        act_type = str(lower_row.get("activity_type") or lower_row.get("activity") or "Walking").strip().capitalize()
        if not act_type or act_type.lower() == "none":
            act_type = "Walking"

        ex_mins = _safe_int(lower_row.get("exercise_minutes") or lower_row.get("workout_minutes"), int(active_mins * 0.6))
        ex_cals = _safe_int(lower_row.get("exercise_calories") or lower_row.get("workout_calories"), int(ex_mins * 7.5))

        records.append({
            "date": date_val,
            "steps": steps,
            "distance_km": distance,
            "active_minutes": active_mins,
            "calories_burned": cals,
            "sleep_hours": sleep_h,
            "deep_sleep_hours": deep_h,
            "light_sleep_hours": light_h,
            "rem_sleep_hours": rem_h,
            "resting_heart_rate": rhr,
            "average_heart_rate": avg_hr,
            "max_heart_rate": max_hr,
            "activity_type": act_type[:50],
            "exercise_minutes": ex_mins,
            "exercise_calories": ex_cals,
        })

    if not records:
        raise ValueError("No valid wearable records could be parsed. Please check that a 'date' column is present.")

    # Sort chronologically
    records.sort(key=lambda r: r["date"])
    return records


def import_wearable_records(db: Session, user_id: int, records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Insert or update wearable daily records for the given user.
    """
    if not records:
        return {"total": 0, "inserted": 0, "updated": 0}

    # Fetch existing dates for this user to perform fast upsert
    existing_records = {
        w.date: w
        for w in db.query(WearableDaily).filter(WearableDaily.user_id == user_id).all()
    }

    inserted_count = 0
    updated_count = 0

    for rec in records:
        d = rec["date"]
        if d in existing_records:
            item = existing_records[d]
            for key, val in rec.items():
                if key != "date":
                    setattr(item, key, val)
            updated_count += 1
        else:
            item = WearableDaily(user_id=user_id, **rec)
            db.add(item)
            existing_records[d] = item
            inserted_count += 1

    db.commit()

    min_date = min(r["date"] for r in records).isoformat()
    max_date = max(r["date"] for r in records).isoformat()

    return {
        "total": len(records),
        "inserted": inserted_count,
        "updated": updated_count,
        "date_range": [min_date, max_date],
    }


def generate_sample_wearable_records(db: Session, user_id: int, days: int = 60) -> Dict[str, Any]:
    """
    Generate realistic multi-week longitudinal wearable dataset
    simulating Apple Watch / Garmin metrics ending at today's date.
    """
    today = date.today()
    start_date = today - timedelta(days=days - 1)

    activity_types = ["Walking", "Running", "Cycling", "Gym", "Yoga", "Swimming"]
    records = []

    # Use deterministic pseudo-random seed per user for realistic coherence
    rnd = random.Random(user_id * 1000 + 42)

    for i in range(days):
        current_date = start_date + timedelta(days=i)
        is_weekend = current_date.weekday() >= 5
        weekend_factor = 0.85 if is_weekend else 1.0

        # Phase drift (normal -> mild fatigue -> recovery)
        progress = i / max(1, days - 1)
        fatigue_wave = 0.12 * math_sin(progress * 6.28)

        # Steps
        base_steps = 8200 * weekend_factor * (1.0 + fatigue_wave)
        steps = int(max(2500, min(16000, rnd.gauss(base_steps, 1200))))
        distance = round(max(steps * rnd.gauss(0.00075, 0.00003), 1.5), 2)
        active_mins = int(max(20, min(140, rnd.gauss(48 * weekend_factor, 12))))
        calories = int(1750 + steps * 0.042 + active_mins * 2.5)

        # Sleep
        sleep_hours = round(max(5.0, min(9.5, rnd.gauss(7.2 - fatigue_wave * 1.5, 0.6))), 1)
        deep_sleep = round(sleep_hours * rnd.uniform(0.18, 0.25), 1)
        rem_sleep = round(sleep_hours * rnd.uniform(0.19, 0.24), 1)
        light_sleep = round(max(0.5, sleep_hours - deep_sleep - rem_sleep), 1)

        # Heart rate
        base_rhr = 66 + int(fatigue_wave * 6)
        rhr = int(max(54, min(84, rnd.gauss(base_rhr, 2.0))))
        avg_hr = int(rhr + rnd.gauss(10, 2))
        max_hr = int(avg_hr + (rnd.gauss(45, 8) if active_mins > 40 else rnd.gauss(28, 5)))

        # Exercise
        act = rnd.choice(activity_types)
        ex_mins = int(max(10, min(active_mins, rnd.gauss(active_mins * 0.7, 6))))
        ex_cals = int(ex_mins * rnd.uniform(6.5, 9.0))

        records.append({
            "date": current_date,
            "steps": steps,
            "distance_km": distance,
            "active_minutes": active_mins,
            "calories_burned": calories,
            "sleep_hours": sleep_hours,
            "deep_sleep_hours": deep_sleep,
            "light_sleep_hours": light_sleep,
            "rem_sleep_hours": rem_sleep,
            "resting_heart_rate": rhr,
            "average_heart_rate": avg_hr,
            "max_heart_rate": max_hr,
            "activity_type": act,
            "exercise_minutes": ex_mins,
            "exercise_calories": ex_cals,
        })

    return import_wearable_records(db, user_id, records)


def math_sin(x: float) -> float:
    import math
    return math.sin(x)

