from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import (
    auth,
    reports,
    biomarkers,
    logs,
    medicines,
    chat,
    summary,
    nutrition,
    wearable,
    xray,
    ecg,
    consultations,
    profile,
    precision,
    ai_insights,
    rag,
)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Health Intelligence API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://healthapp-frontend-1",
        "http://frontend",
    ],
    allow_origin_regex=r"^https?://.*",
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
app.include_router(nutrition.router, prefix="/nutrition", tags=["nutrition"])
app.include_router(wearable.router, prefix="/wearable", tags=["wearable"])
app.include_router(xray.router, prefix="/xray", tags=["xray"])
app.include_router(ecg.router, prefix="/ecg", tags=["ecg"])
app.include_router(consultations.router, prefix="/consultations", tags=["consultations"])
app.include_router(profile.router, prefix="/profile", tags=["profile"])
app.include_router(precision.router, prefix="/precision", tags=["precision-medicine"])
app.include_router(ai_insights.router, prefix="/ai-insights", tags=["ai-insights"])
app.include_router(rag.router, prefix="/rag", tags=["rag"])

@app.get("/")
def root():
    return {"message": "Health Intelligence API running"}
