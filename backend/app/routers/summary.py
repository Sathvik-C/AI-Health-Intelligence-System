from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import User, Biomarker, ManualLog
from app.utils.auth import get_current_user
from app.ai.gemini_service import generate_health_summary
from app.utils.pdf_export import create_summary_pdf

router = APIRouter()

class SummaryExportRequest(BaseModel):
    overall_assessment: Optional[str] = None
    key_improvements: Optional[List[str]] = None
    worsening_indicators: Optional[List[str]] = None
    risk_trends: Optional[List[str]] = None
    important_changes: Optional[List[str]] = None


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

    manual_logs = (
        db.query(ManualLog)
        .filter(ManualLog.user_id == current_user.id)
        .order_by(ManualLog.logged_at.asc())
        .limit(100)
        .all()
    )

    for m in manual_logs:
        biomarker_data.append({
            "name": m.log_type,
            "value": f"{m.value}/{m.value2}" if m.value2 else m.value,
            "unit": m.unit,
            "recorded_at": m.logged_at.isoformat() if m.logged_at else None,
            "source": "Manual Log"
        })

    # Sort combined data by date
    biomarker_data.sort(key=lambda x: x.get("recorded_at") or "")

    try:
        summary = await generate_health_summary(biomarker_data)
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/export_pdf")
def export_pdf(
    req: SummaryExportRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        pdf_buffer = create_summary_pdf(req.model_dump(), user_name=current_user.full_name or current_user.email)
        
        return StreamingResponse(
            pdf_buffer, 
            media_type="application/pdf", 
            headers={"Content-Disposition": "attachment; filename=health_summary.pdf"}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
