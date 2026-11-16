import os
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from app.database import get_db
from app.models.models import Report, Biomarker, User
from app.utils.auth import get_current_user
from app.services.pdf_service import extract_text_from_pdf
from app.services.report_parser import parse_lab_report, read_pdf

# Lab PDFs are read with plain Python first (app/services/report_parser.py). Gemini is used only when Python
# finds fewer than this many values (unusual layouts) or for photos/scans, which need an AI or OCR reader.
MIN_PYTHON_ROWS = int(os.getenv("REPORT_MIN_PYTHON_ROWS", "3"))

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload")
async def upload_report(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    valid_exts = (".pdf", ".png", ".jpg", ".jpeg")
    if not file.filename.lower().endswith(valid_exts):
        raise HTTPException(status_code=400, detail="Only PDF and Image files supported")

    file_path = os.path.join(UPLOAD_DIR, f"{current_user.id}_{datetime.utcnow().timestamp()}_{file.filename}")
    with open(file_path, "wb") as f:
        f.write(await file.read())

    is_pdf = file.filename.lower().endswith(".pdf")
    extracted_text, pdf_tables = "", []
    if is_pdf:
        try:
            extracted_text, pdf_tables = read_pdf(file_path)
        except Exception:
            extracted_text = extract_text_from_pdf(file_path)

    report = Report(
        user_id=current_user.id,
        filename=file.filename,
        file_path=file_path,
        extracted_text=extracted_text,
        report_date=datetime.utcnow(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    # Extract biomarkers: Python first, Gemini only as a fallback
    method = "none"
    try:
        extracted_data = {"report_date": "", "biomarkers": []}
        if is_pdf:
            parsed = parse_lab_report(extracted_text, pdf_tables)
            extracted_data, method = parsed, parsed["method"]
            if len(parsed["biomarkers"]) < MIN_PYTHON_ROWS and os.getenv("GEMINI_API_KEY"):
                try:
                    from app.ai.gemini_service import extract_biomarkers_from_text
                    ai = await extract_biomarkers_from_text(extracted_text)
                    if len(ai.get("biomarkers", [])) > len(parsed["biomarkers"]):
                        extracted_data, method = ai, "gemini-fallback"
                except Exception as e:
                    print(f"⚠️ Gemini fallback failed, keeping Python result: {type(e).__name__}: {e}")
        else:
            from app.ai.gemini_service import extract_biomarkers_from_file
            extracted_data = await extract_biomarkers_from_file(file_path)
            method = "gemini-image"
        print(f"📄 {file.filename}: {len(extracted_data.get('biomarkers', []))} values via {method}")
        
        actual_report_date = report.report_date
        report_date_str = extracted_data.get("report_date")
        if report_date_str:
            try:
                actual_report_date = datetime.strptime(report_date_str, "%Y-%m-%d")
                report.report_date = actual_report_date
                db.commit()
            except ValueError:
                pass

        biomarkers_data = extracted_data.get("biomarkers", [])
        
        for b in biomarkers_data:
            try:
                biomarker = Biomarker(
                    report_id=report.id,
                    user_id=current_user.id,
                    name=b.get("name", "Unknown"),
                    value=float(b.get("value", 0)),
                    unit=b.get("unit", ""),
                    ref_min=float(b["ref_min"]) if b.get("ref_min") not in [None, ""] else None,
                    ref_max=float(b["ref_max"]) if b.get("ref_max") not in [None, ""] else None,
                    recorded_at=actual_report_date,
                )
                db.add(biomarker)
            except (ValueError, TypeError):
                continue
        db.commit()
    except Exception as e:
        print(f"❌ Biomarker extraction failed: {type(e).__name__}: {e}")

    return {"report_id": report.id, "filename": file.filename,
            "biomarkers_extracted": len(biomarkers_data) if 'biomarkers_data' in locals() else 0,
            "extraction_method": method}


@router.get("/")
def list_reports(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    reports = db.query(Report).filter(Report.user_id == current_user.id).order_by(Report.uploaded_at.desc()).all()
    return [
        {
            "id": r.id,
            "filename": r.filename,
            "uploaded_at": r.uploaded_at,
            "report_date": r.report_date,
            "biomarker_count": db.query(Biomarker).filter(Biomarker.report_id == r.id).count(),
        }
        for r in reports
    ]


@router.delete("/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    report = db.query(Report).filter(Report.id == report_id, Report.user_id == current_user.id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    db.query(Biomarker).filter(Biomarker.report_id == report_id).delete()
    db.delete(report)
    db.commit()
    return {"message": "Deleted"}
