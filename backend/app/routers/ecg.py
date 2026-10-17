from fastapi import APIRouter, UploadFile, File, HTTPException, Depends

from app.services.ecg_service import analyze_ecg
from app.utils.auth import get_current_user


router = APIRouter()

MAX_BYTES = 10 * 1024 * 1024  # 10 MB


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
        raise HTTPException(
            status_code=500,
            detail="ECG model weights not found. Place model_fold0.ckpt in backend/ml_weights/ecg/.",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ECG analysis failed: {str(e)}")
