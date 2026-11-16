"""Read lab values from a PDF lab report with plain Python (no AI).

Two independent readers, merged:
  1. tables – pdfplumber table cells, with columns found from the header row
              ("Test / Investigation / Parameter", "Result / Value", "Unit", "Reference range");
  2. text   – line patterns such as  "HbA1c 8.6 % 4.0 – 5.6 H"  or  "Hemoglobin : 13.4 g/dL (13-17)".
Rows from the table reader win when both find the same test.

Output matches what the Gemini extractor returned, so the rest of the app is unchanged:
  {"report_date": "YYYY-MM-DD" | "", "biomarkers": [{"name", "value", "unit", "ref_min", "ref_max"}], "method": ...}

Plain words: the computer reads each table row like a person would — name, number, unit, normal range —
using fixed rules instead of AI, so the same PDF always gives the same answer and nothing is sent to Google.
Limits: photos/scans need OCR or AI; unusual layouts may yield few rows, and the caller then falls back to Gemini.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from app.services.biomarker_catalog import canonical_key

_NUM = r"\d+(?:\.\d+)?"
_RANGE_BETWEEN = re.compile(rf"({_NUM})\s*(?:–|—|-|to)\s*({_NUM})", re.I)
_RANGE_UPPER = re.compile(rf"(?:<=?|≤|up\s*to|upto|below|less than)\s*({_NUM})", re.I)
_RANGE_LOWER = re.compile(rf"(?:>=?|≥|above|more than|greater than)\s*({_NUM})", re.I)
# A value token must stand alone (so the 25 in "Vitamin D (25-OH)" or the 4 in "Free T4" is not taken).
_VALUE = re.compile(rf"(?<=\s)([<>]=?\s?)?({_NUM})(?=\s|$)")
_FLAG = re.compile(r"^(H|L|HH|LL|High|Low|HIGH|LOW|Abnormal|A|\*+|↑|↓)$")
_UNIT_TOKEN = re.compile(r"^(?=.*[A-Za-zµμ%/^²³])[A-Za-zµμ%/^²³0-9.*·]+$")
_SKIP_WORDS = re.compile(r"\b(patient|report|date|page|age|sex|gender|mrn|uhid|ref\.? by|referring|physician|doctor|"
                         r"sample|specimen|collected|received|registered|generated|address|phone|lab no|bill|"
                         r"test name|investigation|method|interpretation|note|impression|signature)\b", re.I)

_HEAD_NAME = re.compile(r"test|investigation|parameter|analyte|description|examination", re.I)
_HEAD_VALUE = re.compile(r"result|value|observed|observation|reading", re.I)
_HEAD_UNIT = re.compile(r"\bunits?\b", re.I)
_HEAD_RANGE = re.compile(r"range|reference|interval|normal|bio\.?\s*ref", re.I)

_MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
_DATE_LABEL = re.compile(r"(report(?:ed|ing)?\s*(?:date|on)?|collect(?:ed|ion)\s*(?:date|on)?|sample\s*date|"
                         r"date\s*of\s*report|test\s*date|date)\s*[:\-]?\s*", re.I)
_DATE_PATTERNS = [
    (re.compile(r"(\d{1,2})[\s\-/.]([A-Za-z]{3,9})[\s\-/.,]+(\d{4})"), "dmy_name"),
    (re.compile(r"([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})"), "mdy_name"),
    (re.compile(r"(\d{4})-(\d{2})-(\d{2})"), "iso"),
    (re.compile(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})"), "dmy_num"),   # Indian reports: day first
]


# --------------------------------------------------------------------------- helpers
def _num(s: str) -> Optional[float]:
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def parse_range(s: str) -> Tuple[Optional[float], Optional[float]]:
    s = (s or "").strip()
    m = _RANGE_BETWEEN.search(s)
    if m:
        lo, hi = _num(m.group(1)), _num(m.group(2))
        if lo is not None and hi is not None and lo <= hi:
            return lo, hi
    m = _RANGE_UPPER.search(s)
    if m:
        return None, _num(m.group(1))
    m = _RANGE_LOWER.search(s)
    if m:
        return _num(m.group(1)), None
    return None, None


def _clean_name(name: str) -> str:
    name = re.sub(r"\s+", " ", (name or "").replace("\n", " ")).strip(" :.-–—\t")
    return name


def _looks_like_name(name: str) -> bool:
    letters = sum(c.isalpha() for c in name)
    return letters >= 2 and len(name) <= 60 and len(name.split()) <= 8


def _row(name, value, unit, lo, hi) -> Dict:
    return {"name": name, "value": str(value), "unit": unit or "",
            "ref_min": "" if lo is None else str(lo), "ref_max": "" if hi is None else str(hi)}


# --------------------------------------------------------------------------- text reader
def parse_line(line: str) -> Optional[Dict]:
    line = re.sub(r"\s+", " ", line).strip()
    if not line or len(line) > 160:
        return None
    if ":" in line:  # "Hemoglobin : 13.4 g/dL" is a result; "Patient Name: …" is not
        head, tail = line.split(":", 1)
        if canonical_key(_clean_name(head)) is None:
            return None
        line = f"{_clean_name(head)} {tail.strip()}"
    m = _VALUE.search(" " + line)
    if not m:
        return None
    start = m.start(1 if m.group(1) else 2) - 1
    name = _clean_name(line[:start])
    if not _looks_like_name(name) or _SKIP_WORDS.search(name):
        return None
    value = _num(m.group(2))
    rest = (" " + line)[m.end():].strip()
    tokens = rest.split()
    unit = ""
    if tokens and not _FLAG.match(tokens[0]) and _UNIT_TOKEN.match(tokens[0]) and not re.fullmatch(_NUM, tokens[0]):
        unit = tokens.pop(0)
        rest = " ".join(tokens)
    lo, hi = parse_range(rest)
    known = canonical_key(name) is not None
    if not known and lo is None and hi is None:
        return None          # an unknown name with no reference range is probably not a result row
    return _row(name, value, unit, lo, hi)


def parse_text(text: str) -> List[Dict]:
    rows = []
    for line in (text or "").splitlines():
        r = parse_line(line)
        if r:
            rows.append(r)
    return rows


# --------------------------------------------------------------------------- table reader
def _header_map(row: List[Optional[str]]) -> Optional[Dict[str, int]]:
    cells = [(c or "").strip() for c in row]
    cols = {}
    for i, c in enumerate(cells):
        if "name" not in cols and _HEAD_NAME.search(c):
            cols["name"] = i
        elif "value" not in cols and _HEAD_VALUE.search(c):
            cols["value"] = i
        elif "unit" not in cols and _HEAD_UNIT.search(c):
            cols["unit"] = i
        elif "range" not in cols and _HEAD_RANGE.search(c):
            cols["range"] = i
    return cols if {"name", "value"} <= set(cols) else None


def parse_tables(tables: List[List[List[Optional[str]]]]) -> List[Dict]:
    rows, header = [], None
    for table in tables:
        for raw in table:
            if not raw or not any(raw):
                continue
            h = _header_map(raw)
            if h:
                header = h
                continue
            if header is None or max(header.values()) >= len(raw):
                continue
            name = _clean_name(raw[header["name"]] or "")
            vcell = (raw[header["value"]] or "").strip()
            vm = re.search(_NUM, vcell)
            if not name or not vm or not _looks_like_name(name):
                continue
            unit = (raw[header["unit"]] or "").strip() if "unit" in header else ""
            lo, hi = parse_range(raw[header["range"]] or "") if "range" in header else (None, None)
            rows.append(_row(name, _num(vm.group(0)), unit, lo, hi))
    return rows


# --------------------------------------------------------------------------- date
def _to_iso(kind: str, g: Tuple[str, ...]) -> Optional[str]:
    try:
        if kind == "dmy_name":
            d, mon, y = int(g[0]), _MONTHS.get(g[1][:3].lower()), int(g[2])
        elif kind == "mdy_name":
            mon, d, y = _MONTHS.get(g[0][:3].lower()), int(g[1]), int(g[2])
        elif kind == "iso":
            y, mon, d = int(g[0]), int(g[1]), int(g[2])
        else:
            d, mon, y = int(g[0]), int(g[1]), int(g[2])
        if not mon:
            return None
        return datetime(y, mon, d).date().isoformat()
    except (ValueError, TypeError):
        return None


def parse_report_date(text: str) -> str:
    """Prefer a date right after a 'Report/Collected/Sample date' label; never the date of birth."""
    lines = (text or "").splitlines()
    candidates = []
    for line in lines[:60]:
        for m in _DATE_LABEL.finditer(line):
            if re.search(r"birth|dob", line[max(0, m.start() - 12):m.end()], re.I):
                continue
            tail = line[m.end():m.end() + 40]
            for pat, kind in _DATE_PATTERNS:
                dm = pat.match(tail.strip())
                if dm:
                    iso = _to_iso(kind, dm.groups())
                    if iso:
                        candidates.append(iso)
                    break
    if candidates:
        return candidates[0]
    for line in lines[:60]:
        if re.search(r"birth|dob", line, re.I):
            continue
        for pat, kind in _DATE_PATTERNS:
            dm = pat.search(line)
            if dm:
                iso = _to_iso(kind, dm.groups())
                if iso:
                    return iso
    return ""


# --------------------------------------------------------------------------- entry point
def _key(name: str) -> str:
    return canonical_key(name) or re.sub(r"[^a-z0-9]", "", name.lower())


def parse_lab_report(text: str, tables: Optional[List] = None) -> Dict:
    table_rows = parse_tables(tables or [])
    text_rows = parse_text(text)
    merged: Dict[str, Dict] = {}
    for r in text_rows:
        merged.setdefault(_key(r["name"]), r)
    for r in table_rows:          # table cells are the more reliable reading
        merged[_key(r["name"])] = r
    order = [_key(r["name"]) for r in (table_rows or text_rows)]
    order += [k for k in merged if k not in order]
    method = "python-table" if table_rows else ("python-text" if text_rows else "python")
    return {"report_date": parse_report_date(text), "biomarkers": [merged[k] for k in order if k in merged],
            "method": method, "counts": {"table": len(table_rows), "text": len(text_rows)}}


def read_pdf(path: str) -> Tuple[str, List]:
    """Text and tables of a PDF (pdfplumber)."""
    import pdfplumber

    texts, tables = [], []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            texts.append(page.extract_text() or "")
            try:
                tables.extend(page.extract_tables() or [])
            except Exception:
                pass
    return "\n".join(texts), tables
