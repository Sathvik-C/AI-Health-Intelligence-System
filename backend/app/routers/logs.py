from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.database import get_db
from app.models.models import ManualLog, User
from app.utils.auth import get_current_user

router = APIRouter()


class LogCreate(BaseModel):
    log_type: str  # blood_pressure, glucose, weight, pulse
    value: float
    value2: Optional[float] = None
    unit: Optional[str] = None
    notes: Optional[str] = None
    logged_at: Optional[datetime] = None


@router.post("/")
def create_log(data: LogCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    log = ManualLog(
        user_id=current_user.id,
        log_type=data.log_type,
        value=data.value,
        value2=data.value2,
        unit=data.unit,
        notes=data.notes,
        logged_at=data.logged_at or datetime.utcnow(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {"id": log.id, "message": "Log created"}


@router.get("/")
def get_logs(
    log_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ManualLog).filter(ManualLog.user_id == current_user.id)
    if log_type:
        query = query.filter(ManualLog.log_type == log_type)
    logs = query.order_by(ManualLog.logged_at.asc()).all()
    return [
        {
            "id": l.id,
            "log_type": l.log_type,
            "value": l.value,
            "value2": l.value2,
            "unit": l.unit,
            "notes": l.notes,
            "logged_at": l.logged_at,
        }
        for l in logs
    ]


@router.delete("/{log_id}")
def delete_log(log_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    log = db.query(ManualLog).filter(ManualLog.id == log_id, ManualLog.user_id == current_user.id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    db.delete(log)
    db.commit()
    return {"message": "Deleted"}
