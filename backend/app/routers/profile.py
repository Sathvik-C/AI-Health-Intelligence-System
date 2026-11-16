"""Patient profile (demographics, lifestyle, family history, pharmacogenomic results)."""
from datetime import date
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import PatientProfile, User
from app.services import pgx_rules
from app.services.health_facts import load_context, suggest_profile
from app.utils.auth import get_current_user

router = APIRouter()

CONDITIONS = ["type2_diabetes", "type1_diabetes", "prediabetes", "hypertension", "dyslipidemia", "ckd",
              "fatty_liver", "hypothyroidism", "hyperthyroidism", "coronary_artery_disease", "stroke", "asthma",
              "copd", "rheumatoid_arthritis", "psoriasis", "lupus", "hiv", "pcos"]


class ProfileIn(BaseModel):
    date_of_birth: Optional[date] = None
    sex: Optional[Literal["male", "female"]] = None
    height_cm: Optional[float] = Field(None, ge=50, le=250)
    weight_kg: Optional[float] = Field(None, ge=10, le=400)
    waist_cm: Optional[float] = Field(None, ge=30, le=250)
    ancestry: Optional[Literal["south_asian", "east_asian", "african", "european", "hispanic", "middle_eastern",
                               "other"]] = None
    smoking_status: Optional[Literal["never", "former", "current"]] = None
    alcohol_use: Optional[Literal["none", "occasional", "regular"]] = None
    physical_activity: Optional[Literal["vigorous", "moderate", "mild", "sedentary"]] = None
    parents_with_diabetes: Optional[int] = Field(None, ge=0, le=2)
    family_history_premature_ascvd: Optional[bool] = None
    known_conditions: Optional[List[str]] = None
    on_bp_treatment: Optional[bool] = None
    pgx_results: Optional[Dict[str, Optional[str]]] = None


FIELDS = list(ProfileIn.model_fields.keys())


def _serialise(p: Optional[PatientProfile]) -> Dict:
    if p is None:
        return {f: None for f in FIELDS} | {"updated_at": None}
    out = {f: getattr(p, f) for f in FIELDS}
    out["updated_at"] = p.updated_at
    return out


@router.get("/")
def get_profile(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ctx = load_context(db, current_user)
    return {
        "profile": _serialise(ctx.profile),
        "suggestions": suggest_profile(ctx.report_texts),
        "options": {
            "conditions": CONDITIONS,
            "pgx_genes": [{"gene": g, "values": v["values"], "about": v["about"]} for g, v in pgx_rules.GENES.items()],
        },
    }


@router.put("/")
def save_profile(data: ProfileIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if data.date_of_birth and not (date(1900, 1, 1) <= data.date_of_birth <= date.today()):
        raise HTTPException(status_code=422, detail="Date of birth looks wrong")
    if data.known_conditions is not None:
        unknown = [c for c in data.known_conditions if c not in CONDITIONS]
        if unknown:
            raise HTTPException(status_code=422, detail=f"Unknown conditions: {unknown}")
    if data.pgx_results is not None:
        clean = {}
        for gene, val in data.pgx_results.items():
            if gene not in pgx_rules.GENES:
                raise HTTPException(status_code=422, detail=f"Unknown gene: {gene}")
            if val in (None, ""):
                continue
            if val not in pgx_rules.GENES[gene]["values"]:
                raise HTTPException(status_code=422, detail=f"Invalid result '{val}' for {gene}")
            clean[gene] = val
        data.pgx_results = clean

    p = db.query(PatientProfile).filter(PatientProfile.user_id == current_user.id).first()
    if p is None:
        p = PatientProfile(user_id=current_user.id)
        db.add(p)
    for f in FIELDS:
        setattr(p, f, getattr(data, f))
    db.commit()
    db.refresh(p)
    return {"profile": _serialise(p), "message": "Profile saved"}
