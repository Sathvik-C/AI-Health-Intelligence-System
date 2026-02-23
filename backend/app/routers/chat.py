from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.models import User, Biomarker, Report
from app.utils.auth import get_current_user
from app.ai.rag_service import get_rag_answer

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    doctor_mode: bool = False


@router.post("/")
async def chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Gather biomarker context
    biomarkers = (
        db.query(Biomarker)
        .filter(Biomarker.user_id == current_user.id)
        .order_by(Biomarker.recorded_at.desc())
        .limit(100)
        .all()
    )

    # Gather report texts
    reports = db.query(Report).filter(Report.user_id == current_user.id).order_by(Report.uploaded_at.desc()).limit(5).all()
    report_texts = [r.extracted_text for r in reports if r.extracted_text]

    biomarker_context = [
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
        answer = await get_rag_answer(
            question=req.message,
            biomarker_context=biomarker_context,
            report_texts=report_texts,
            doctor_mode=req.doctor_mode,
        )
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
