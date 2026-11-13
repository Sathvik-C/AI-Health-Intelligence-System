from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
from app.database import get_db
from app.models.models import Consultation, PrescriptionChange, ScheduledTest, Medicine, User
from app.utils.auth import get_current_user

router = APIRouter()


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class PrescriptionCreate(BaseModel):
    drug_name: str
    previous_dosage: Optional[str] = None
    new_dosage: Optional[str] = None
    frequency: Optional[str] = None
    change_type: str = "added"  # added, modified, stopped, continued
    reason: Optional[str] = None


class ScheduledTestCreate(BaseModel):
    test_name: str
    due_date: date
    frequency: Optional[str] = "once"
    instructions: Optional[str] = None


class ScheduledTestUpdate(BaseModel):
    test_name: Optional[str] = None
    due_date: Optional[date] = None
    frequency: Optional[str] = None
    instructions: Optional[str] = None
    completed: Optional[bool] = None


class ConsultationCreate(BaseModel):
    doctor_name: str
    doctor_specialty: Optional[str] = None
    consultation_date: Optional[date] = None
    soap_subjective: Optional[str] = None
    soap_objective: Optional[str] = None
    soap_assessment: Optional[str] = None
    soap_plan: Optional[str] = None
    lifestyle_notes: Optional[str] = None
    follow_up_date: Optional[date] = None
    follow_up_time: Optional[str] = None
    status: Optional[str] = "active"
    prescriptions: Optional[List[PrescriptionCreate]] = []
    scheduled_tests: Optional[List[ScheduledTestCreate]] = []


class ConsultationUpdate(BaseModel):
    doctor_name: Optional[str] = None
    doctor_specialty: Optional[str] = None
    consultation_date: Optional[date] = None
    soap_subjective: Optional[str] = None
    soap_objective: Optional[str] = None
    soap_assessment: Optional[str] = None
    soap_plan: Optional[str] = None
    lifestyle_notes: Optional[str] = None
    follow_up_date: Optional[date] = None
    follow_up_time: Optional[str] = None
    status: Optional[str] = None


# ─── Upcoming Tests (Dashboard & Reminders) ──────────────────────────────────

@router.get("/upcoming-tests")
def get_upcoming_tests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tests = (
        db.query(ScheduledTest)
        .join(Consultation, ScheduledTest.consultation_id == Consultation.id)
        .filter(
            ScheduledTest.user_id == current_user.id,
            ScheduledTest.completed == False,
        )
        .order_by(ScheduledTest.due_date.asc())
        .all()
    )

    return [
        {
            "id": t.id,
            "consultation_id": t.consultation_id,
            "test_name": t.test_name,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "frequency": t.frequency,
            "instructions": t.instructions,
            "completed": t.completed,
            "doctor_name": t.consultation.doctor_name if t.consultation else None,
            "doctor_specialty": t.consultation.doctor_specialty if t.consultation else None,
        }
        for t in tests
    ]


# ─── Consultation Endpoints ──────────────────────────────────────────────────

@router.get("/")
def get_consultations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    consultations = (
        db.query(Consultation)
        .filter(Consultation.user_id == current_user.id)
        .order_by(Consultation.consultation_date.desc(), Consultation.id.desc())
        .all()
    )

    result = []
    for c in consultations:
        result.append({
            "id": c.id,
            "doctor_name": c.doctor_name,
            "doctor_specialty": c.doctor_specialty,
            "consultation_date": c.consultation_date.isoformat() if c.consultation_date else None,
            "soap_subjective": c.soap_subjective,
            "soap_objective": c.soap_objective,
            "soap_assessment": c.soap_assessment,
            "soap_plan": c.soap_plan,
            "lifestyle_notes": c.lifestyle_notes,
            "follow_up_date": c.follow_up_date.isoformat() if c.follow_up_date else None,
            "follow_up_time": c.follow_up_time,
            "status": c.status,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "prescriptions": [
                {
                    "id": p.id,
                    "drug_name": p.drug_name,
                    "previous_dosage": p.previous_dosage,
                    "new_dosage": p.new_dosage,
                    "frequency": p.frequency,
                    "change_type": p.change_type,
                    "reason": p.reason,
                    "synced_to_medicines": p.synced_to_medicines,
                }
                for p in c.prescriptions
            ],
            "scheduled_tests": [
                {
                    "id": t.id,
                    "test_name": t.test_name,
                    "due_date": t.due_date.isoformat() if t.due_date else None,
                    "frequency": t.frequency,
                    "instructions": t.instructions,
                    "completed": t.completed,
                    "completed_at": t.completed_at.isoformat() if t.completed_at else None,
                }
                for t in c.scheduled_tests
            ],
        })
    return result


@router.post("/")
def create_consultation(
    data: ConsultationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    c_date = data.consultation_date or datetime.utcnow().date()
    consultation = Consultation(
        user_id=current_user.id,
        doctor_name=data.doctor_name,
        doctor_specialty=data.doctor_specialty,
        consultation_date=c_date,
        soap_subjective=data.soap_subjective,
        soap_objective=data.soap_objective,
        soap_assessment=data.soap_assessment,
        soap_plan=data.soap_plan,
        lifestyle_notes=data.lifestyle_notes,
        follow_up_date=data.follow_up_date,
        follow_up_time=data.follow_up_time,
        status=data.status or "active",
    )
    db.add(consultation)
    db.flush()

    for p in data.prescriptions or []:
        rx = PrescriptionChange(
            consultation_id=consultation.id,
            user_id=current_user.id,
            drug_name=p.drug_name,
            previous_dosage=p.previous_dosage,
            new_dosage=p.new_dosage,
            frequency=p.frequency,
            change_type=p.change_type,
            reason=p.reason,
            synced_to_medicines=False,
        )
        db.add(rx)

    for t in data.scheduled_tests or []:
        st = ScheduledTest(
            consultation_id=consultation.id,
            user_id=current_user.id,
            test_name=t.test_name,
            due_date=t.due_date,
            frequency=t.frequency or "once",
            instructions=t.instructions,
            completed=False,
        )
        db.add(st)

    db.commit()
    db.refresh(consultation)
    return {"id": consultation.id, "message": "Consultation created successfully"}


@router.get("/{c_id}")
def get_consultation(
    c_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    c = db.query(Consultation).filter(Consultation.id == c_id, Consultation.user_id == current_user.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Consultation not found")

    return {
        "id": c.id,
        "doctor_name": c.doctor_name,
        "doctor_specialty": c.doctor_specialty,
        "consultation_date": c.consultation_date.isoformat() if c.consultation_date else None,
        "soap_subjective": c.soap_subjective,
        "soap_objective": c.soap_objective,
        "soap_assessment": c.soap_assessment,
        "soap_plan": c.soap_plan,
        "lifestyle_notes": c.lifestyle_notes,
        "follow_up_date": c.follow_up_date.isoformat() if c.follow_up_date else None,
        "follow_up_time": c.follow_up_time,
        "status": c.status,
        "prescriptions": [
            {
                "id": p.id,
                "drug_name": p.drug_name,
                "previous_dosage": p.previous_dosage,
                "new_dosage": p.new_dosage,
                "frequency": p.frequency,
                "change_type": p.change_type,
                "reason": p.reason,
                "synced_to_medicines": p.synced_to_medicines,
            }
            for p in c.prescriptions
        ],
        "scheduled_tests": [
            {
                "id": t.id,
                "test_name": t.test_name,
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "frequency": t.frequency,
                "instructions": t.instructions,
                "completed": t.completed,
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            }
            for t in c.scheduled_tests
        ],
    }


@router.put("/{c_id}")
def update_consultation(
    c_id: int,
    data: ConsultationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    c = db.query(Consultation).filter(Consultation.id == c_id, Consultation.user_id == current_user.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Consultation not found")

    for k, v in data.dict(exclude_unset=True).items():
        setattr(c, k, v)
    c.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Consultation updated successfully"}


@router.delete("/{c_id}")
def delete_consultation(
    c_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    c = db.query(Consultation).filter(Consultation.id == c_id, Consultation.user_id == current_user.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Consultation not found")
    db.delete(c)
    db.commit()
    return {"message": "Consultation deleted"}


# ─── Prescription Sub-routes ────────────────────────────────────────────────

@router.post("/{c_id}/prescriptions")
def add_prescription(
    c_id: int,
    data: PrescriptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    c = db.query(Consultation).filter(Consultation.id == c_id, Consultation.user_id == current_user.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Consultation not found")

    rx = PrescriptionChange(
        consultation_id=c.id,
        user_id=current_user.id,
        drug_name=data.drug_name,
        previous_dosage=data.previous_dosage,
        new_dosage=data.new_dosage,
        frequency=data.frequency,
        change_type=data.change_type,
        reason=data.reason,
        synced_to_medicines=False,
    )
    db.add(rx)
    db.commit()
    db.refresh(rx)
    return {"id": rx.id, "message": "Prescription change added"}


@router.delete("/{c_id}/prescriptions/{rx_id}")
def delete_prescription(
    c_id: int,
    rx_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    rx = db.query(PrescriptionChange).filter(
        PrescriptionChange.id == rx_id,
        PrescriptionChange.consultation_id == c_id,
        PrescriptionChange.user_id == current_user.id
    ).first()
    if not rx:
        raise HTTPException(status_code=404, detail="Prescription change not found")
    db.delete(rx)
    db.commit()
    return {"message": "Prescription change removed"}


@router.post("/{c_id}/prescriptions/{rx_id}/sync")
def sync_prescription_to_medicines(
    c_id: int,
    rx_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    rx = db.query(PrescriptionChange).filter(
        PrescriptionChange.id == rx_id,
        PrescriptionChange.consultation_id == c_id,
        PrescriptionChange.user_id == current_user.id
    ).first()
    if not rx:
        raise HTTPException(status_code=404, detail="Prescription change not found")

    c = rx.consultation
    consult_date = c.consultation_date if c else datetime.utcnow().date()
    doctor_info = f"Prescribed by Dr. {c.doctor_name} on {consult_date}" if c else "Synced from care plan"

    if rx.change_type == "stopped":
        # Find active medicine and set end_date
        med = (
            db.query(Medicine)
            .filter(
                Medicine.user_id == current_user.id,
                Medicine.drug_name.ilike(rx.drug_name.strip())
            )
            .first()
        )
        if med:
            med.end_date = consult_date
            med.notes = f"{med.notes or ''} | Discontinued on {consult_date}: {rx.reason or 'Stopped by doctor'}".strip(" |")
    elif rx.change_type == "modified":
        # Look for existing medicine or create new if not present
        med = (
            db.query(Medicine)
            .filter(
                Medicine.user_id == current_user.id,
                Medicine.drug_name.ilike(rx.drug_name.strip())
            )
            .first()
        )
        if med:
            med.dosage = rx.new_dosage or med.dosage
            med.notes = f"{med.notes or ''} | {doctor_info}. Freq: {rx.frequency or 'as directed'}. Reason: {rx.reason or 'Modified'}".strip(" |")
        else:
            med = Medicine(
                user_id=current_user.id,
                drug_name=rx.drug_name,
                dosage=rx.new_dosage or rx.previous_dosage,
                start_date=consult_date,
                notes=f"{doctor_info}. Freq: {rx.frequency or 'as directed'}",
            )
            db.add(med)
    else:  # "added" or "continued"
        med = (
            db.query(Medicine)
            .filter(
                Medicine.user_id == current_user.id,
                Medicine.drug_name.ilike(rx.drug_name.strip())
            )
            .first()
        )
        if med and rx.change_type == "continued":
            med.notes = f"{med.notes or ''} | Continued by {doctor_info}".strip(" |")
        else:
            dosage = rx.new_dosage or rx.previous_dosage or "As prescribed"
            freq_str = f"Freq: {rx.frequency}" if rx.frequency else ""
            notes_str = f"{doctor_info}. {freq_str}".strip()
            med = Medicine(
                user_id=current_user.id,
                drug_name=rx.drug_name,
                dosage=dosage,
                start_date=consult_date,
                notes=notes_str,
            )
            db.add(med)

    rx.synced_to_medicines = True
    db.commit()
    return {"message": f"'{rx.drug_name}' synced to daily Medicine Tracker successfully"}


# ─── Scheduled Tests Sub-routes ─────────────────────────────────────────────

@router.post("/{c_id}/tests")
def add_scheduled_test(
    c_id: int,
    data: ScheduledTestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    c = db.query(Consultation).filter(Consultation.id == c_id, Consultation.user_id == current_user.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Consultation not found")

    st = ScheduledTest(
        consultation_id=c.id,
        user_id=current_user.id,
        test_name=data.test_name,
        due_date=data.due_date,
        frequency=data.frequency or "once",
        instructions=data.instructions,
        completed=False,
    )
    db.add(st)
    db.commit()
    db.refresh(st)
    return {"id": st.id, "message": "Scheduled test added"}


@router.put("/{c_id}/tests/{test_id}")
def update_scheduled_test(
    c_id: int,
    test_id: int,
    data: ScheduledTestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    st = db.query(ScheduledTest).filter(
        ScheduledTest.id == test_id,
        ScheduledTest.consultation_id == c_id,
        ScheduledTest.user_id == current_user.id
    ).first()
    if not st:
        raise HTTPException(status_code=404, detail="Scheduled test not found")

    update_dict = data.dict(exclude_unset=True)
    if "completed" in update_dict and update_dict["completed"] and not st.completed:
        st.completed_at = datetime.utcnow()
    elif "completed" in update_dict and not update_dict["completed"]:
        st.completed_at = None

    for k, v in update_dict.items():
        setattr(st, k, v)

    db.commit()
    return {"message": "Scheduled test updated"}


@router.delete("/{c_id}/tests/{test_id}")
def delete_scheduled_test(
    c_id: int,
    test_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    st = db.query(ScheduledTest).filter(
        ScheduledTest.id == test_id,
        ScheduledTest.consultation_id == c_id,
        ScheduledTest.user_id == current_user.id
    ).first()
    if not st:
        raise HTTPException(status_code=404, detail="Scheduled test not found")
    db.delete(st)
    db.commit()
    return {"message": "Scheduled test removed"}
