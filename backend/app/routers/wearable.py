from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import WearableDaily, User
from app.utils.auth import get_current_user


router = APIRouter(
    tags=["wearable"]
)


@router.get("/summary")
def get_wearable_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Return the latest wearable health metrics
    for the authenticated user.
    """

    latest_record = (
        db.query(WearableDaily)
        .filter(
            WearableDaily.user_id == current_user.id
        )
        .order_by(
            WearableDaily.date.desc()
        )
        .first()
    )

    if not latest_record:
        raise HTTPException(
            status_code=404,
            detail="No wearable data found for this user."
        )

    return {
        "date": latest_record.date,
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
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Return wearable data for the requested number
    of recent days.
    """

    if days < 1 or days > 365:
        raise HTTPException(
            status_code=400,
            detail="Days must be between 1 and 365."
        )

    records = (
        db.query(WearableDaily)
        .filter(
            WearableDaily.user_id == current_user.id
        )
        .order_by(
            WearableDaily.date.desc()
        )
        .limit(days)
        .all()
    )

    records.reverse()

    return [
        {
            "date": record.date,
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