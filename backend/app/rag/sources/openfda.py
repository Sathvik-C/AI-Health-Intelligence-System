"""openFDA drug labels -> Documents (one per label section).

API:     GET https://api.fda.gov/drug/label.json?search=openfda.generic_name:"metformin"&limit=25
Licence: openFDA data is released into the public domain (CC0). A free API key (optional) raises
         the daily limit; set OPENFDA_API_KEY to use one.
Note:    labels exist only for US-approved medicines, so India-only generics are reported as "not found".
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from app.rag import config
from app.rag.sources.common import Document, Http
from app.rag.vocab import find_drugs, find_genes

LICENCE = "Public domain (CC0) – openFDA"

# (openFDA field, display name). Older (non-PLR) labels use warnings/precautions instead of
# warnings_and_cautions; we keep whichever the label has.
SECTIONS: List[Tuple[str, str]] = [
    ("boxed_warning", "Boxed warning"),
    ("indications_and_usage", "Indications and usage"),
    ("dosage_and_administration", "Dosage and administration"),
    ("contraindications", "Contraindications"),
    ("warnings_and_cautions", "Warnings and precautions"),
    ("warnings", "Warnings"),
    ("precautions", "Precautions"),
    ("adverse_reactions", "Adverse reactions"),
    ("drug_interactions", "Drug interactions"),
    ("use_in_specific_populations", "Use in specific populations"),
    ("pharmacogenomics", "Pharmacogenomics"),
]


# Very long sections are trimmed to their opening (which summarises the most important points) to keep the
# knowledge base within the free embedding quota. The citation card links to the full label on DailyMed.
MAX_WORDS = {"adverse_reactions": 700, "dosage_and_administration": 1500, "use_in_specific_populations": 1500}


def _generic_names(result: Dict) -> List[str]:
    return [g.lower() for g in (result.get("openfda", {}) or {}).get("generic_name", []) or []]


def _is_single_ingredient(name: str) -> bool:
    return " and " not in name and "," not in name and "/" not in name


def _score(result: Dict, drug: str) -> Tuple:
    names = _generic_names(result)
    of = result.get("openfda", {}) or {}
    single = any(drug in n and _is_single_ingredient(n) for n in names)
    rx = any("PRESCRIPTION" in (t or "").upper() for t in of.get("product_type", []) or [])
    plr = bool(result.get("warnings_and_cautions"))
    return (single, rx, plr, result.get("effective_time", "") or "")


def select_label(results: List[Dict], drug: str) -> Optional[Dict]:
    """Best label for a generic: single-ingredient, prescription, modern format, newest."""
    drug = drug.lower()
    matching = [r for r in results if any(drug in n for n in _generic_names(r))]
    if not matching:
        return None
    return max(matching, key=lambda r: _score(r, drug))


def label_to_documents(label: Dict, drug: str) -> List[Document]:
    of = label.get("openfda", {}) or {}
    generic = (of.get("generic_name") or [drug])[0]
    brand = (of.get("brand_name") or [None])[0]
    set_id = label.get("set_id") or (of.get("spl_set_id") or [None])[0]
    url = (f"https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid={set_id}" if set_id
           else "https://open.fda.gov/apis/drug/label/")
    eff = label.get("effective_time", "")
    version = f"label effective {eff[:4]}-{eff[4:6]}-{eff[6:8]}" if len(eff) >= 8 else "label"
    name = generic.title() + (f" ({brand.title()})" if brand and brand.lower() != generic.lower() else "")

    has_plr = bool(label.get("warnings_and_cautions"))
    docs = []
    for field, display in SECTIONS:
        if has_plr and field in ("warnings", "precautions"):
            continue
        parts = label.get(field) or []
        text = "\n".join(p for p in parts if isinstance(p, str)).strip()
        if len(text) < 40:
            continue
        words = text.split()
        if field in MAX_WORDS and len(words) > MAX_WORDS[field]:
            text = " ".join(words[:MAX_WORDS[field]]) + " … (section shortened here; see the full label)"
        mentioned = sorted(find_drugs(text) - {drug})
        docs.append(Document(
            doc_id=f"openfda:{drug}:{field}",
            source="openfda",
            title=f"{name} — FDA label",
            section=display,
            url=url,
            text=text,
            tags={"drugs": [drug], "mentioned_drugs": mentioned[:30], "genes": sorted(find_genes(text))},
            licence=LICENCE,
            version=version,
        ))
    return docs


def fetch(drugs: List[str], http: Optional[Http] = None, log=print) -> Tuple[List[Document], Dict]:
    http = http or Http(min_interval=0.3)
    docs: List[Document] = []
    report = {"found": [], "not_found": [], "errors": []}
    for drug in drugs:
        params = {"search": f'openfda.generic_name:"{drug}"', "limit": 25}
        if config.OPENFDA_API_KEY:
            params["api_key"] = config.OPENFDA_API_KEY
        try:
            r = http.get(config.OPENFDA_URL, params=params)
        except Exception as e:  # network
            report["errors"].append(f"{drug}: {e}")
            continue
        if r.status_code == 404:
            report["not_found"].append(drug)
            continue
        if r.status_code != 200:
            report["errors"].append(f"{drug}: HTTP {r.status_code}")
            continue
        label = select_label(r.json().get("results", []), drug)
        if not label:
            report["not_found"].append(drug)
            continue
        d = label_to_documents(label, drug)
        docs.extend(d)
        report["found"].append(f"{drug} ({len(d)} sections)")
        log(f"  openFDA  {drug:<22} {len(d)} sections")
    return docs, report
