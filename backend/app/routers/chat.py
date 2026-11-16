"""Ask Your Health Record.

Answers come from the RAG pipeline (app/rag): public references (FDA labels, CPIC, MedlinePlus) plus the
facts the app computed from this user's records. Every sentence carries citations and passes the citation
validator; if nothing survives, the user gets "no sourced answer" instead of a guess.
The response keeps the old `answer` string so existing widgets work unchanged.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import User
from app.rag.answer import answer_question
from app.utils.auth import get_current_user

router = APIRouter()
log = logging.getLogger("chat")


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    doctor_mode: bool = False


# Plain `def` so FastAPI runs the blocking Gemini calls in a worker thread.
@router.post("/")
def chat(req: ChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        return answer_question(db, current_user, req.message, doctor_mode=req.doctor_mode)
    except Exception as e:
        log.exception("chat failed")
        raise HTTPException(status_code=500, detail=f"Chat failed: {type(e).__name__}")
