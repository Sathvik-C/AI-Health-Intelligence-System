from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date
from app.database import get_db
from app.models.models import Medicine, User
from app.utils.auth import get_current_user

router = APIRouter()


class MedicineCreate(BaseModel):
    drug_name: str
    dosage: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    notes: Optional[str] = None


@router.post("/")
def create_medicine(data: MedicineCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    med = Medicine(user_id=current_user.id, **data.dict())
    db.add(med)
    db.commit()
    db.refresh(med)
    return {"id": med.id, "message": "Medicine added"}


@router.get("/")
def get_medicines(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    meds = db.query(Medicine).filter(Medicine.user_id == current_user.id).order_by(Medicine.start_date.asc()).all()
    return [
        {
            "id": m.id,
            "drug_name": m.drug_name,
            "dosage": m.dosage,
            "start_date": m.start_date,
            "end_date": m.end_date,
            "notes": m.notes,
        }
        for m in meds
    ]


@router.delete("/{med_id}")
def delete_medicine(med_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    med = db.query(Medicine).filter(Medicine.id == med_id, Medicine.user_id == current_user.id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medicine not found")
    db.delete(med)
    db.commit()
    return {"message": "Deleted"}
