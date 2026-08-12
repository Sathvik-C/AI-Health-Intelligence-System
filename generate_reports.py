import os
import shutil

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
except ImportError:
    import subprocess
    import sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "reportlab"])
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas


def create_report(filename, patient_name, date, biomarkers):
    c = canvas.Canvas(filename, pagesize=letter)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, 750, "Laboratory Test Report")

    c.setFont("Helvetica", 12)
    c.drawString(50, 720, f"Patient Name: {patient_name}")
    c.drawString(50, 700, f"Date: {date}")

    c.drawString(50, 660, "Biomarker")
    c.drawString(250, 660, "Value")
    c.drawString(350, 660, "Unit")
    c.drawString(450, 660, "Reference Range")

    c.line(50, 650, 550, 650)

    y = 630
    for bm in biomarkers:
        c.drawString(50, y, bm["name"])
        c.drawString(250, y, str(bm["value"]))
        c.drawString(350, y, bm["unit"])
        c.drawString(450, y, bm["ref"])
        y -= 25
        if y < 100:
            c.showPage()
            y = 750

    c.save()
    print(f"Generated {filename}")


if __name__ == "__main__":
    # Clear existing sample reports
    if os.path.exists("sample_reports"):
        for f in os.listdir("sample_reports"):
            fp = os.path.join("sample_reports", f)
            if os.path.isfile(fp):
                os.remove(fp)
    os.makedirs("sample_reports", exist_ok=True)

    patient = "Adam"

    # Same biomarkers tracked over 6 months — realistic trends:
    # - HbA1c: improving (7.8 -> 6.1)
    # - Fasting Glucose: improving (155 -> 105)
    # - LDL: worsening slightly (115 -> 145)
    # - HDL: stable-low (38 -> 42)
    # - Triglycerides: fluctuating (190 -> 175)
    # - Creatinine: stable-normal
    # - Hemoglobin: stable
    # - BP Systolic: improving (148 -> 132)

    reports = [
        {
            "date": "2025-10-15",
            "biomarkers": [
                {"name": "HbA1c", "value": 7.8, "unit": "%", "ref": "4.0 - 5.6"},
                {"name": "Fasting Glucose", "value": 155, "unit": "mg/dL", "ref": "70 - 99"},
                {"name": "LDL", "value": 115, "unit": "mg/dL", "ref": "< 100"},
                {"name": "HDL", "value": 38, "unit": "mg/dL", "ref": "> 40"},
                {"name": "Triglycerides", "value": 190, "unit": "mg/dL", "ref": "< 150"},
                {"name": "Creatinine", "value": 0.9, "unit": "mg/dL", "ref": "0.7 - 1.3"},
                {"name": "Hemoglobin", "value": 13.2, "unit": "g/dL", "ref": "13.0 - 17.0"},
                {"name": "BP Systolic", "value": 148, "unit": "mmHg", "ref": "< 120"},
            ],
        },
        {
            "date": "2025-12-10",
            "biomarkers": [
                {"name": "HbA1c", "value": 7.4, "unit": "%", "ref": "4.0 - 5.6"},
                {"name": "Fasting Glucose", "value": 142, "unit": "mg/dL", "ref": "70 - 99"},
                {"name": "LDL", "value": 122, "unit": "mg/dL", "ref": "< 100"},
                {"name": "HDL", "value": 39, "unit": "mg/dL", "ref": "> 40"},
                {"name": "Triglycerides", "value": 210, "unit": "mg/dL", "ref": "< 150"},
                {"name": "Creatinine", "value": 0.95, "unit": "mg/dL", "ref": "0.7 - 1.3"},
                {"name": "Hemoglobin", "value": 13.5, "unit": "g/dL", "ref": "13.0 - 17.0"},
                {"name": "BP Systolic", "value": 144, "unit": "mmHg", "ref": "< 120"},
            ],
        },
        {
            "date": "2026-02-08",
            "biomarkers": [
                {"name": "HbA1c", "value": 7.0, "unit": "%", "ref": "4.0 - 5.6"},
                {"name": "Fasting Glucose", "value": 130, "unit": "mg/dL", "ref": "70 - 99"},
                {"name": "LDL", "value": 128, "unit": "mg/dL", "ref": "< 100"},
                {"name": "HDL", "value": 40, "unit": "mg/dL", "ref": "> 40"},
                {"name": "Triglycerides", "value": 185, "unit": "mg/dL", "ref": "< 150"},
                {"name": "Creatinine", "value": 1.0, "unit": "mg/dL", "ref": "0.7 - 1.3"},
                {"name": "Hemoglobin", "value": 13.8, "unit": "g/dL", "ref": "13.0 - 17.0"},
                {"name": "BP Systolic", "value": 140, "unit": "mmHg", "ref": "< 120"},
            ],
        },
        {
            "date": "2026-04-12",
            "biomarkers": [
                {"name": "HbA1c", "value": 6.6, "unit": "%", "ref": "4.0 - 5.6"},
                {"name": "Fasting Glucose", "value": 118, "unit": "mg/dL", "ref": "70 - 99"},
                {"name": "LDL", "value": 135, "unit": "mg/dL", "ref": "< 100"},
                {"name": "HDL", "value": 41, "unit": "mg/dL", "ref": "> 40"},
                {"name": "Triglycerides", "value": 195, "unit": "mg/dL", "ref": "< 150"},
                {"name": "Creatinine", "value": 0.85, "unit": "mg/dL", "ref": "0.7 - 1.3"},
                {"name": "Hemoglobin", "value": 14.0, "unit": "g/dL", "ref": "13.0 - 17.0"},
                {"name": "BP Systolic", "value": 136, "unit": "mmHg", "ref": "< 120"},
            ],
        },
        {
            "date": "2026-06-18",
            "biomarkers": [
                {"name": "HbA1c", "value": 6.3, "unit": "%", "ref": "4.0 - 5.6"},
                {"name": "Fasting Glucose", "value": 112, "unit": "mg/dL", "ref": "70 - 99"},
                {"name": "LDL", "value": 140, "unit": "mg/dL", "ref": "< 100"},
                {"name": "HDL", "value": 42, "unit": "mg/dL", "ref": "> 40"},
                {"name": "Triglycerides", "value": 180, "unit": "mg/dL", "ref": "< 150"},
                {"name": "Creatinine", "value": 0.88, "unit": "mg/dL", "ref": "0.7 - 1.3"},
                {"name": "Hemoglobin", "value": 13.9, "unit": "g/dL", "ref": "13.0 - 17.0"},
                {"name": "BP Systolic", "value": 134, "unit": "mmHg", "ref": "< 120"},
            ],
        },
        {
            "date": "2026-08-10",
            "biomarkers": [
                {"name": "HbA1c", "value": 6.1, "unit": "%", "ref": "4.0 - 5.6"},
                {"name": "Fasting Glucose", "value": 105, "unit": "mg/dL", "ref": "70 - 99"},
                {"name": "LDL", "value": 145, "unit": "mg/dL", "ref": "< 100"},
                {"name": "HDL", "value": 42, "unit": "mg/dL", "ref": "> 40"},
                {"name": "Triglycerides", "value": 175, "unit": "mg/dL", "ref": "< 150"},
                {"name": "Creatinine", "value": 0.92, "unit": "mg/dL", "ref": "0.7 - 1.3"},
                {"name": "Hemoglobin", "value": 14.1, "unit": "g/dL", "ref": "13.0 - 17.0"},
                {"name": "BP Systolic", "value": 132, "unit": "mmHg", "ref": "< 120"},
            ],
        },
    ]

    for i, report in enumerate(reports, 1):
        create_report(
            f"sample_reports/{i}_report_{report['date']}.pdf",
            patient,
            report["date"],
            report["biomarkers"],
        )

    print(f"\nAll {len(reports)} reports generated for patient '{patient}' in 'sample_reports/'")
