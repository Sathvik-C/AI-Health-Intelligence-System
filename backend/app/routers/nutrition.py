from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import User, Biomarker, ManualLog, DietPlan
from app.utils.auth import get_current_user
from app.ai.nutrition_service import generate_diet_plan
import json

router = APIRouter()

@router.get("/plan")
def get_latest_plan(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = db.query(DietPlan).filter(DietPlan.user_id == current_user.id).order_by(DietPlan.created_at.desc()).first()
    if not plan:
        return None
    return plan.plan_data

@router.post("/generate")
async def generate_plan(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    biomarkers = db.query(Biomarker).filter(Biomarker.user_id == current_user.id).order_by(Biomarker.recorded_at.asc()).limit(100).all()
    manual_logs = db.query(ManualLog).filter(ManualLog.user_id == current_user.id).order_by(ManualLog.logged_at.asc()).limit(100).all()
    
    health_data = []
    for b in biomarkers:
        health_data.append({
            "name": b.name,
            "value": b.value,
            "unit": b.unit,
            "ref_min": b.ref_min,
            "ref_max": b.ref_max,
            "source": "Lab Report",
            "date": b.recorded_at.isoformat() if b.recorded_at else None
        })
    for m in manual_logs:
        health_data.append({
            "name": m.log_type,
            "value": f"{m.value}/{m.value2}" if m.value2 else m.value,
            "unit": m.unit,
            "source": "Manual Log",
            "date": m.logged_at.isoformat() if m.logged_at else None
        })
    
    health_data.sort(key=lambda x: x.get("date") or "")

    try:
        plan_json = await generate_diet_plan(health_data)
        
        # Save to DB
        new_plan = DietPlan(user_id=current_user.id, plan_data=plan_json)
        db.add(new_plan)
        db.commit()
        db.refresh(new_plan)
        
        return plan_json
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
