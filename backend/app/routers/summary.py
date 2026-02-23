from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import User, Biomarker
from app.utils.auth import get_current_user
from app.ai.openai_service import generate_health_summary

router = APIRouter()


@router.post("/generate")
async def generate_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    biomarkers = (
        db.query(Biomarker)
        .filter(Biomarker.user_id == current_user.id)
        .order_by(Biomarker.recorded_at.asc())
        .all()
    )

    if not biomarkers:
        raise HTTPException(status_code=400, detail="No biomarker data available")

    biomarker_data = [
        {
            "name": b.name,
            "value": b.value,
            "unit": b.unit,
            "ref_min": b.ref_min,
            "ref_max": b.ref_max,
            "recorded_at": b.recorded_at.isoformat() if b.recorded_at else None,
        }
        for b in biomarkers
    ]

    try:
        summary = await generate_health_summary(biomarker_data)
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
