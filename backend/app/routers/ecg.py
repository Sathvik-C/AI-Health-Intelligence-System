import os

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends

from app.services.ecg_service import analyze_ecg
from app.utils.auth import get_current_user


router = APIRouter()

MAX_BYTES = 10 * 1024 * 1024  # 10 MB
ECG_DEMO_MODE = os.getenv("ECG_DEMO_MODE", "false").lower() in {"1", "true", "yes", "on"}


def _demo_analysis():
    """Fixed illustrative response for demos when model weights are unavailable."""
    definitions = [
        ("1dAVb", "First-degree AV block", "Conduction", 0.18,
         "A pattern that may be associated with a slightly slowed electrical signal between the upper and lower chambers of the heart."),
        ("RBBB", "Right bundle branch block", "Conduction", 0.12,
         "A pattern that may be associated with a delay in the heart's electrical signal on the right side."),
        ("LBBB", "Left bundle branch block", "Conduction", 0.08,
         "A pattern that may be associated with a delay in the heart's electrical signal on the left side."),
        ("SB", "Sinus bradycardia (slow heart rate)", "Rhythm", 0.24,
         "A pattern that may be associated with a slow but regular heart rhythm."),
        ("AF", "Atrial fibrillation", "Rhythm", 0.67,
         "A pattern that may be associated with an irregular rhythm in the upper chambers of the heart."),
        ("ST", "Sinus tachycardia (fast heart rate)", "Rhythm", 0.14,
         "A pattern that may be associated with a fast but regular heart rhythm."),
    ]
    observations = []
    for code, name, category, score, description in definitions:
        level = "high" if score >= 0.80 else "moderate" if score >= 0.50 else "not_detected"
        interpretation = {
            "high": "Strong model score",
            "moderate": "Possible (less certain)",
            "not_detected": "Not detected",
        }[level]
        observations.append({
            "code": code,
            "technical_name": code,
            "name": name,
            "category": category,
            "score": score,
            "interpretation": interpretation,
            "level": level,
            "status": {"high": "attention", "moderate": "review", "not_detected": "minimal"}[level],
            "description": description,
        })
    observations.sort(key=lambda item: item["score"], reverse=True)
    demo_disclaimer = (
        "DEMO ONLY — These are fixed illustrative values, not computed from the uploaded ECG. "
        "They must not be used for medical decisions. This is not a diagnosis."
    )
    return {
        "message": "Illustrative ECG demo generated; no model inference was run.",
        "model": "DEMO ONLY — simulated sample output (no ECG model loaded)",
        "demo_mode": True,
        "summary": {
            "status": "demo",
            "text": "DEMO ONLY: This sample screen shows how an illustrative review flag appears. No ECG was analyzed and this is not a medical finding.",
        },
        "patient_summary": (
            "Demonstration output\n\n"
            "- This screen contains fixed sample values to demonstrate the interface.\n"
            "- The uploaded ECG image was not analyzed.\n"
            "- Do not use these values for medical decisions.\n\n"
            "This is a software demonstration only, not a diagnosis."
        ),
        "observations": observations,
        "technical_scores": {item[0]: item[3] for item in definitions},
        "disclaimer": demo_disclaimer,
    }


@router.post("/analyze")
async def analyze_ecg_report(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """
    Analyze an uploaded 12-lead ECG image with a pretrained ConvNeXt-Tiny model.
    Checks six conditions only (no normal class).
    """

    allowed_types = {"image/png", "image/jpeg", "image/jpg", "image/webp"}

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Please upload a PNG, JPEG or WebP ECG image.",
        )

    try:
        contents = await file.read()

        if len(contents) > MAX_BYTES:
            raise HTTPException(status_code=413, detail="Image is larger than 10 MB.")

        analysis = analyze_ecg(contents)

        return {
            "message": "ECG analysis completed",
            "model": "ConvNeXt-Tiny (pretrained_image_ecg_doc)",
            **analysis,
        }

    except HTTPException:
        raise
    except FileNotFoundError:
        if ECG_DEMO_MODE:
            return _demo_analysis()
        raise HTTPException(
            status_code=500,
            detail="ECG model weights not found. Place model_fold0.ckpt in backend/ml_weights/ecg/.",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ECG analysis failed: {str(e)}")
