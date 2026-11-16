"""Nutrition: daily diet plan built with fixed rules from the latest results (no Gemini call)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Biomarker, DietPlan, User
from app.services.diet_rules import build_diet_plan
from app.services.health_facts import load_context
from app.utils.auth import get_current_user

router = APIRouter()


@router.get("/plan")
def get_latest_plan(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    plan = db.query(DietPlan).filter(DietPlan.user_id == current_user.id).order_by(DietPlan.created_at.desc()).first()
    return plan.plan_data if plan else None


@router.post("/generate")
def generate_plan(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not db.query(Biomarker).filter(Biomarker.user_id == current_user.id).first():
        raise HTTPException(status_code=400, detail="Upload a lab report first so the plan can be based on your results.")
    plan = build_diet_plan(load_context(db, current_user))
    db.add(DietPlan(user_id=current_user.id, plan_data=plan))
    db.commit()
    return plan
