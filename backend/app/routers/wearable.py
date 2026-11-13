from datetime import date as DateType
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import WearableDaily, User
from app.utils.auth import get_current_user
from app.services.wearable_service import (
    parse_wearable_file,
    import_wearable_records,
    generate_sample_wearable_records,
)

router = APIRouter(tags=["wearable"])


class WearableEntryRequest(BaseModel):
    date: DateType
    steps: int = Field(default=7500, ge=0)
    resting_heart_rate: int = Field(default=68, ge=35, le=220)
    sleep_hours: float = Field(default=7.5, ge=0.0, le=24.0)
    calories_burned: Optional[int] = None
    distance_km: Optional[float] = None
    active_minutes: Optional[int] = None
    activity_type: Optional[str] = "Walking"


@router.get("/summary")
def get_wearable_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return the latest wearable health metrics for the authenticated user.
    """
    latest_record = (
        db.query(WearableDaily)
        .filter(WearableDaily.user_id == current_user.id)
        .order_by(WearableDaily.date.desc())
        .first()
    )

    if not latest_record:
        raise HTTPException(
            status_code=404,
            detail="No wearable data found for this user."
        )

    return {
        "date": latest_record.date.isoformat(),
        "steps": latest_record.steps,
        "distance_km": latest_record.distance_km,
        "active_minutes": latest_record.active_minutes,
        "calories_burned": latest_record.calories_burned,
        "sleep_hours": latest_record.sleep_hours,
        "deep_sleep_hours": latest_record.deep_sleep_hours,
        "light_sleep_hours": latest_record.light_sleep_hours,
        "rem_sleep_hours": latest_record.rem_sleep_hours,
        "resting_heart_rate": latest_record.resting_heart_rate,
        "average_heart_rate": latest_record.average_heart_rate,
        "max_heart_rate": latest_record.max_heart_rate,
        "activity_type": latest_record.activity_type,
        "exercise_minutes": latest_record.exercise_minutes,
        "exercise_calories": latest_record.exercise_calories,
    }


@router.get("/trends")
def get_wearable_trends(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return wearable data for the requested number of recent days.
    """
    records = (
        db.query(WearableDaily)
        .filter(WearableDaily.user_id == current_user.id)
        .order_by(WearableDaily.date.desc())
        .limit(days)
        .all()
    )

    records.reverse()

    return [
        {
            "date": record.date.isoformat(),
            "steps": record.steps,
            "distance_km": record.distance_km,
            "active_minutes": record.active_minutes,
            "calories_burned": record.calories_burned,
            "sleep_hours": record.sleep_hours,
            "deep_sleep_hours": record.deep_sleep_hours,
            "light_sleep_hours": record.light_sleep_hours,
            "rem_sleep_hours": record.rem_sleep_hours,
            "resting_heart_rate": record.resting_heart_rate,
            "average_heart_rate": record.average_heart_rate,
            "max_heart_rate": record.max_heart_rate,
            "activity_type": record.activity_type,
            "exercise_minutes": record.exercise_minutes,
            "exercise_calories": record.exercise_calories,
        }
        for record in records
    ]


@router.post("/upload")
async def upload_wearable_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Import wearable history from a CSV or JSON file.
    Accepts exports from Apple Health, Fitbit, Garmin, Google Fit, Whoop, etc.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected for upload.")

    filename_lower = file.filename.lower()
    valid_exts = (".csv", ".json", ".tsv", ".txt")
    if not any(filename_lower.endswith(ext) for ext in valid_exts):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Please upload a .CSV or .JSON file.",
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 25 MB.")

    try:
        parsed_records = parse_wearable_file(content, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")

    summary = import_wearable_records(db, current_user.id, parsed_records)
    return {
        "status": "success",
        "message": f"Successfully imported {summary['inserted']} new and updated {summary['updated']} wearable records.",
        "details": summary,
    }


@router.post("/sample")
def import_sample_wearable_data(
    days: int = Query(60, ge=7, le=180),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate realistic multi-week longitudinal wearable dataset
    (Apple Watch / Garmin style) for instant demo and testing.
    """
    summary = generate_sample_wearable_records(db, current_user.id, days=days)
    return {
        "status": "success",
        "message": f"Successfully generated {summary['inserted'] + summary['updated']} days of wearable health history.",
        "details": summary,
    }


@router.post("/entry")
def log_single_wearable_entry(
    entry: WearableEntryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Add or update a single day's wearable activity & biometric metrics.
    """
    # Calculate intelligent defaults if optional fields omitted
    distance = entry.distance_km if entry.distance_km is not None else round(max(entry.steps * 0.00075, 1.0), 2)
    active_mins = entry.active_minutes if entry.active_minutes is not None else int(max(20, min(180, round(entry.steps / 160))))
    cals = entry.calories_burned if entry.calories_burned is not None else int(1700 + entry.steps * 0.04)

    record_dict = {
        "date": entry.date,
        "steps": entry.steps,
        "distance_km": distance,
        "active_minutes": active_mins,
        "calories_burned": cals,
        "sleep_hours": round(entry.sleep_hours, 2),
        "deep_sleep_hours": round(entry.sleep_hours * 0.22, 2),
        "light_sleep_hours": round(entry.sleep_hours * 0.56, 2),
        "rem_sleep_hours": round(entry.sleep_hours * 0.22, 2),
        "resting_heart_rate": entry.resting_heart_rate,
        "average_heart_rate": entry.resting_heart_rate + 8,
        "max_heart_rate": entry.resting_heart_rate + 45,
        "activity_type": entry.activity_type or "Walking",
        "exercise_minutes": int(active_mins * 0.6),
        "exercise_calories": int(active_mins * 4.5),
    }

    summary = import_wearable_records(db, current_user.id, [record_dict])
    return {
        "status": "success",
        "message": f"Recorded wearable metrics for {entry.date.isoformat()}",
        "details": summary,
    }


@router.delete("/clear")
def clear_user_wearable_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete all wearable data records for the current user.
    """
    deleted_count = (
        db.query(WearableDaily)
        .filter(WearableDaily.user_id == current_user.id)
        .delete()
    )
    db.commit()
    return {
        "status": "success",
        "message": f"Cleared {deleted_count} wearable records.",
        "deleted_count": deleted_count,
    }


@router.get("/template")
def download_wearable_template():
    """
    Download a sample CSV template for importing wearable data.
    """
    csv_content = (
        "date,steps,resting_heart_rate,sleep_hours,calories_burned,distance_km,active_minutes,activity_type\n"
        "2026-10-01,8420,66,7.4,2150,6.2,52,Walking\n"
        "2026-10-02,10150,64,7.8,2380,7.6,65,Running\n"
        "2026-10-03,6900,68,6.9,1980,5.1,40,Rest\n"
        "2026-10-04,9200,65,7.2,2210,6.9,58,Cycling\n"
        "2026-10-05,11400,63,8.0,2500,8.4,72,Gym\n"
    )
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=wearables_template.csv"}
    )
