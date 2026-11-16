from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import User, Biomarker, ManualLog
from app.utils.auth import get_current_user
from app.services.health_facts import load_context
from app.services.summary_rules import build_health_summary
from app.utils.pdf_export import create_summary_pdf

router = APIRouter()

class SummaryExportRequest(BaseModel):
    overall_assessment: Optional[str] = None
    key_improvements: Optional[List[str]] = None
    worsening_indicators: Optional[List[str]] = None
    risk_trends: Optional[List[str]] = None
    important_changes: Optional[List[str]] = None


@router.post("/generate")
def generate_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Health Insights summary, computed in Python from lab trends (no Gemini call)."""
    if not db.query(Biomarker).filter(Biomarker.user_id == current_user.id).first():
        raise HTTPException(status_code=400, detail="No biomarker data available")
    return build_health_summary(load_context(db, current_user))

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
