"""AI Insights endpoints.

GET  /ai-insights/                      -> last saved insights (+ whether the data changed since)
POST /ai-insights/generate              -> Python rules (no Gemini call); cached per data fingerprint
POST /ai-insights/generate?use_ai=true  -> "Rewrite with AI": Gemini from the same facts (rules as fallback)
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.ai import insights_service
from app.database import get_db
from app.models.models import AIInsightCache, Biomarker, User
from app.services.analytics_service import compute_risk_scores
from app.services.health_facts import load_context
from app.services.precision_service import build_precision_report
from app.utils.auth import get_current_user

router = APIRouter()


def _facts(db: Session, user: User):
    ctx = load_context(db, user)
    precision = build_precision_report(ctx)
    bms = db.query(Biomarker).filter(Biomarker.user_id == user.id).all()
    risk = compute_risk_scores(bms) if bms else None
    facts = insights_service.build_facts(ctx, precision, risk)
    return facts, precision


def _response(row: AIInsightCache, facts, current_fp: str):
    return {
        **row.payload,
        "facts": row.payload.get("facts") or facts,
        "fingerprint": row.fingerprint,
        "is_stale": row.fingerprint != current_fp,
        "cached_at": row.created_at.isoformat() + "Z",
    }


@router.get("/")
def latest(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    facts, _ = _facts(db, current_user)
    fp = insights_service.fingerprint(facts, insights_service.DEFAULT_MODEL)
    row = (db.query(AIInsightCache).filter(AIInsightCache.user_id == current_user.id)
           .order_by(AIInsightCache.created_at.desc()).first())
    if row is None:
        return {"insights": None, "is_stale": True, "facts_available": len(facts)}
    return _response(row, facts, fp)


# Plain `def` (not async): FastAPI runs it in a worker thread, so the blocking Gemini call
# does not freeze the server for other users.
@router.post("/generate")
def generate(force: bool = False, use_ai: bool = False, db: Session = Depends(get_db),
             current_user: User = Depends(get_current_user)):
    facts, precision = _facts(db, current_user)
    fp = insights_service.fingerprint(facts, insights_service.DEFAULT_MODEL)
    row = (db.query(AIInsightCache).filter(AIInsightCache.user_id == current_user.id)
           .order_by(AIInsightCache.created_at.desc()).first())
    # Same data and no force: reuse what we have (a Gemini rewrite stays until the data changes).
    if row is not None and row.fingerprint == fp and not force and (not use_ai or row.source == "gemini"):
        return _response(row, facts, fp)

    result = insights_service.generate(facts, precision, use_ai=use_ai)
    payload = {**result, "facts": facts}
    db.query(AIInsightCache).filter(AIInsightCache.user_id == current_user.id).delete()
    row = AIInsightCache(user_id=current_user.id, fingerprint=fp, source=result["source"], model=result["model"],
                         payload=payload)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _response(row, facts, fp)
