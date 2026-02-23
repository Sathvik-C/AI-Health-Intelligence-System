from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import auth, reports, biomarkers, logs, medicines, chat, summary

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Health Intelligence API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://healthapp-frontend-1", "http://frontend"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(reports.router, prefix="/reports", tags=["reports"])
app.include_router(biomarkers.router, prefix="/biomarkers", tags=["biomarkers"])
app.include_router(logs.router, prefix="/logs", tags=["logs"])
app.include_router(medicines.router, prefix="/medicines", tags=["medicines"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(summary.router, prefix="/summary", tags=["summary"])

@app.get("/")
def root():
    return {"message": "Health Intelligence API running"}
