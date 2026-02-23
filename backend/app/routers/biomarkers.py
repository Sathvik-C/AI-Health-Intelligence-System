from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models.models import Biomarker, User
from app.utils.auth import get_current_user
from app.services.analytics_service import (
    forecast_biomarker,
    compute_risk_scores,
    detect_anomalies,
)

router = APIRouter()


@router.get("/")
def get_biomarkers(
    name: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Biomarker).filter(Biomarker.user_id == current_user.id)
    if name:
        query = query.filter(Biomarker.name.ilike(f"%{name}%"))
    biomarkers = query.order_by(Biomarker.recorded_at.asc()).all()
    return [
        {
            "id": b.id,
            "name": b.name,
            "value": b.value,
            "unit": b.unit,
            "ref_min": b.ref_min,
            "ref_max": b.ref_max,
            "recorded_at": b.recorded_at,
            "report_id": b.report_id,
        }
        for b in biomarkers
    ]


@router.get("/names")
def get_biomarker_names(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import distinct
    names = db.query(distinct(Biomarker.name)).filter(Biomarker.user_id == current_user.id).all()
    return [n[0] for n in names]


@router.get("/forecast/{biomarker_name}")
def get_forecast(
    biomarker_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    biomarkers = (
        db.query(Biomarker)
        .filter(Biomarker.user_id == current_user.id, Biomarker.name.ilike(f"%{biomarker_name}%"))
        .order_by(Biomarker.recorded_at.asc())
        .all()
    )
    if len(biomarkers) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 data points for forecast")

    return forecast_biomarker(biomarkers)


@router.get("/risk-scores")
def get_risk_scores(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    biomarkers = db.query(Biomarker).filter(Biomarker.user_id == current_user.id).order_by(Biomarker.recorded_at.desc()).all()
    return compute_risk_scores(biomarkers)


@router.get("/anomalies")
def get_anomalies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    biomarkers = db.query(Biomarker).filter(Biomarker.user_id == current_user.id).order_by(Biomarker.recorded_at.asc()).all()
    return detect_anomalies(biomarkers)
