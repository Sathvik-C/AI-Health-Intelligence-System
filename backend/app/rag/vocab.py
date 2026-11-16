"""Drug / gene vocabulary and entity extraction.

Used for three things:
  1. choosing which FDA labels to download by default,
  2. tagging knowledge-base chunks with the drugs and genes they mention,
  3. spotting drugs/genes in a question (retrieval boost) and in an AI claim (citation check 2).
"""
from __future__ import annotations

import re
from typing import Dict, Iterable, List, Optional, Set

from app.services.pgx_rules import ALL_RULE_DRUGS, BRANDS, GENES
from app.services.precision_service import ANTIHYPERTENSIVE_NAMES, GLUCOSE_LOWERING, NSAIDS, STATINS

# Common chronic-disease medicines with US labels (FDA labels exist only for US-approved drugs;
# India-only generics such as teneligliptin or voglibose are skipped automatically).
EXTRA_LABEL_DRUGS = {
    "lisinopril", "enalapril", "ramipril", "losartan", "telmisartan", "olmesartan", "valsartan",
    "amlodipine", "atenolol", "bisoprolol", "levothyroxine", "aspirin", "febuxostat", "colchicine",
}

DEFAULT_LABEL_DRUGS: List[str] = sorted(
    (set(ALL_RULE_DRUGS) | STATINS | (GLUCOSE_LOWERING - {"insulin"}) | (NSAIDS - {"mefenamic"}) | {"mefenamic acid"}
     | ANTIHYPERTENSIVE_NAMES | EXTRA_LABEL_DRUGS)
)

# Gene symbols the app knows about, plus other CPIC genes so tags are complete.
APP_GENE_SYMBOLS: Set[str] = {g.split("*")[0] for g in GENES}
CPIC_EXTRA_GENES = {"UGT1A1", "CYP4F2", "CYP2B6", "IFNL3", "RYR1", "CACNA1S", "MT-RNR1", "CFTR", "ABCG2",
                    "NAT2", "HLA-A", "HLA-B", "HLA-C", "CYP3A4", "BCHE", "POLG", "SLC6A4", "HTR2A"}
GENE_SYMBOLS: Set[str] = APP_GENE_SYMBOLS | CPIC_EXTRA_GENES

_GENE_RE = re.compile(
    r"(?<![A-Za-z0-9])(" + "|".join(sorted((re.escape(g) for g in GENE_SYMBOLS), key=len, reverse=True)) +
    r")(\*\d+(?::\d+)?)?(?![A-Za-z0-9])",
    re.I,
)

_dynamic_drugs: Set[str] = set()


def register_drugs(names: Iterable[str]) -> None:
    """Add drug names found in the knowledge base (e.g. every CPIC drug) to the vocabulary."""
    for n in names:
        n = (n or "").strip().lower()
        if 3 <= len(n) <= 60:
            _dynamic_drugs.add(n)


def all_drugs() -> Set[str]:
    return set(DEFAULT_LABEL_DRUGS) | set(ALL_RULE_DRUGS) | _dynamic_drugs


def _phrase_in(phrase: str, text_lower: str) -> bool:
    return re.search(r"(?<![a-z0-9])" + re.escape(phrase) + r"(?![a-z0-9])", text_lower) is not None


def find_drugs(text: str, vocab: Optional[Set[str]] = None) -> Set[str]:
    """Generic names mentioned in text (brand names are mapped to generics)."""
    low = (text or "").lower()
    found = {d for d in (vocab or all_drugs()) if _phrase_in(d, low)}
    for brand, generic in BRANDS.items():
        if _phrase_in(brand, low):
            found.add(generic)
    return found


def find_genes(text: str) -> Set[str]:
    """Gene symbols mentioned in text, upper-cased; HLA alleles keep the allele (HLA-B*57:01)."""
    out = set()
    for m in _GENE_RE.finditer(text or ""):
        sym = m.group(1).upper()
        out.add(sym)
        if m.group(2):
            out.add(sym + m.group(2))
    return out


def extract_entities(text: str) -> Dict[str, List[str]]:
    return {"drugs": sorted(find_drugs(text)), "genes": sorted(find_genes(text))}


def tag_index(tags: Dict[str, Iterable[str]]) -> str:
    """Flat, LIKE-searchable form of a chunk's tags: |drug:metformin|gene:cyp2c19|topic:diabetes|"""
    parts = []
    for kind, singular in (("drugs", "drug"), ("genes", "gene"), ("topics", "topic")):
        for v in tags.get(kind, []) or []:
            parts.append(f"{singular}:{str(v).lower()}")
    return "|" + "|".join(sorted(set(parts))) + "|" if parts else ""
