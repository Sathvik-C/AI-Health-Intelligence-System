"""Python lab-report reader (no AI): sample PDFs + common Indian lab line formats."""
import glob
import os
import re
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.report_parser import (  # noqa: E402
    parse_lab_report, parse_line, parse_range, parse_report_date, parse_tables, parse_text, read_pdf)

SAMPLES = sorted(glob.glob(os.path.join(os.path.dirname(__file__), "..", "..", "test_data", "*.pdf")))


@pytest.mark.skipif(not SAMPLES, reason="test_data PDFs not present")
@pytest.mark.parametrize("path", SAMPLES)
def test_text_reader_matches_table_cells_and_date(path):
    text, tables = read_pdf(path)
    truth = parse_tables(tables)
    got = {r["name"]: r for r in parse_text(text)}
    assert len(truth) == 41
    for t in truth:
        g = got[t["name"]]
        assert (g["value"], g["unit"], g["ref_min"], g["ref_max"]) == (t["value"], t["unit"], t["ref_min"], t["ref_max"])
    out = parse_lab_report(text, tables)
    assert len(out["biomarkers"]) == 41 and out["method"] == "python-table"
    assert out["report_date"] == re.search(r"(\d{4}-\d{2}-\d{2})", os.path.basename(path)).group(1)


@pytest.mark.parametrize("line,expected", [
    ("HbA1c 8.6 % 4.0 – 5.6 H", ("HbA1c", "8.6", "%", "4.0", "5.6")),
    ("Vitamin D (25-OH) 14 ng/mL 30 – 100 L", ("Vitamin D (25-OH)", "14.0", "ng/mL", "30.0", "100.0")),
    ("Free T4 1.1 ng/dL 0.8 – 1.8", ("Free T4", "1.1", "ng/dL", "0.8", "1.8")),
    ("eGFR 78 mL/min/1.73m² 90 – 120 L", ("eGFR", "78.0", "mL/min/1.73m²", "90.0", "120.0")),
    ("Hemoglobin : 13.4 g/dL (13.0 - 17.0)", ("Hemoglobin", "13.4", "g/dL", "13.0", "17.0")),
    ("Total Cholesterol 190 mg/dL < 200", ("Total Cholesterol", "190.0", "mg/dL", "", "200.0")),
    ("HDL Cholesterol 45 mg/dL > 40", ("HDL Cholesterol", "45.0", "mg/dL", "40.0", "")),
    ("Platelet Count 2.4 lakhs/cumm 1.5 to 4.5", ("Platelet Count", "2.4", "lakhs/cumm", "1.5", "4.5")),
    ("TSH 3.8 mIU/L", ("TSH", "3.8", "mIU/L", "", "")),           # known test, no range printed
])
def test_parse_line_formats(line, expected):
    r = parse_line(line)
    assert (r["name"], r["value"], r["unit"], r["ref_min"], r["ref_max"]) == expected


@pytest.mark.parametrize("line", [
    "Age / Sex: 42 years / Male Referring Physician: Dr. Priya Nair",
    "Patient Name: Arjun Sharma Report Date: 15 September 2025",
    "Date of Birth: 12-Mar-1982 MRN: MRN-20240001",
    "Page 1 of 2",
    "Initiating Metformin 500mg BD, Atorvastatin 40mg OD",
    "Some unknown note 42",
])
def test_non_result_lines_are_ignored(line):
    assert parse_line(line) is None


@pytest.mark.parametrize("text,iso", [
    ("Patient Name: A Report Date: 15 September 2025\nDate of Birth: 12-Mar-1982", "2025-09-15"),
    ("Date of Birth: 12-Mar-1982\nCollected on: 03/02/2026", "2026-02-03"),
    ("Reported: 2026-07-10 09:12", "2026-07-10"),
    ("DOB: 01/01/1980\nSample Date - 5 Jan 2026", "2026-01-05"),
    ("no dates here", ""),
])
def test_report_date(text, iso):
    assert parse_report_date(text) == iso


def test_range_parser():
    assert parse_range("4.0 – 5.6") == (4.0, 5.6)
    assert parse_range("Up to 35") == (None, 35.0)
    assert parse_range(">= 60") == (60.0, None)
    assert parse_range("Negative") == (None, None)
