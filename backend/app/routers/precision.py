"""Precision medicine report (deterministic; no AI call)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import User
from app.services.health_facts import load_context
from app.services.precision_service import build_precision_report
from app.utils.auth import get_current_user

router = APIRouter()


@router.get("/report")
def precision_report(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return build_precision_report(load_context(db, current_user))
