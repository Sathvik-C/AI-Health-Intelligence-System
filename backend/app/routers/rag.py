"""RAG endpoints.

GET  /rag/status  -> knowledge-base size, vector backend, sources and licences (public info)
POST /rag/ask     -> same grounded, cited answer as POST /chat/
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import User
from app.rag.answer import answer_question
from app.rag.embeddings import default_embedder
from app.rag.sources import SOURCE_INFO
from app.rag.store import get_store
from app.utils.auth import get_current_user

router = APIRouter()


class AskRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    doctor_mode: bool = False


@router.get("/status")
def status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    store = get_store(db.get_bind())
    st = store.stats(db)
    model_id = default_embedder().model_id          # does not load the model
    current = store.count_embedded(db, model_id)
    return {**st, "embedded": current, "embedded_any_model": st["embedded"], "embed_model": model_id,
            "sources": SOURCE_INFO, "ready": current > 0}


# Plain `def`: FastAPI runs it in a worker thread, so blocking Gemini calls don't stall other requests.
@router.post("/ask")
def ask(req: AskRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return answer_question(db, current_user, req.message, doctor_mode=req.doctor_mode)
