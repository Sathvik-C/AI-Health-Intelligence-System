"""CPIC gene–drug recommendations -> Documents (one per distinct recommendation).

API:     https://api.cpicpgx.org/v1  (PostgREST; tables guideline, drug, recommendation)
Schema:  recommendation(id, guidelineid, drugid, implications jsonb, drugrecommendation, classification,
         phenotypes jsonb, activityscore jsonb, allelestatus jsonb, lookupkey jsonb, population, comments, version)
         — taken from the cpic-data repository migrations (V1 bootstrap + later ALTERs).
Licence: CPIC curated content is CC0 1.0. CPIC asks users to cite the URL, date accessed and version,
         and to read the full guideline because nuances may not be obvious from table downloads.
"""
from __future__ import annotations

import hashlib
import json
from datetime import date
from typing import Dict, Iterable, List, Optional, Set, Tuple

from app.rag import config
from app.rag.sources.common import Document, Http
from app.rag.vocab import APP_GENE_SYMBOLS

LICENCE = "CC0 1.0 – CPIC (cpicpgx.org)"
GUIDELINES_URL = "https://cpicpgx.org/guidelines/"
_SKIP_RECOMMENDATION = {"", "n/a", "no recommendation"}


def _paged(http: Http, path: str, select: str, page: int = 1000) -> List[Dict]:
    rows, offset = [], 0
    while True:
        r = http.get(f"{config.CPIC_API}/{path}",
                     params={"select": select, "order": "id" if path != "drug" else "drugid",
                             "limit": page, "offset": offset})
        r.raise_for_status()
        batch = r.json()
        rows.extend(batch)
        if len(batch) < page:
            return rows
        offset += page


def _genes_of(rec: Dict) -> Set[str]:
    genes: Set[str] = set()
    for key in ("phenotypes", "implications", "allelestatus", "lookupkey", "activityscore"):
        val = rec.get(key) or {}
        if isinstance(val, dict):
            genes.update(k.upper() for k in val)
    return genes


def _clean(v) -> str:
    s = str(v or "").strip()
    return "" if s.lower() in ("n/a", "none", "null") else s


def _group_key(rec: Dict) -> Tuple:
    return (rec.get("guidelineid"), rec.get("drugid"), _clean(rec.get("population")),
            json.dumps(rec.get("phenotypes") or {}, sort_keys=True),
            json.dumps(rec.get("allelestatus") or {}, sort_keys=True),
            _clean(rec.get("drugrecommendation")), _clean(rec.get("classification")))


def recommendations_to_documents(recs: Iterable[Dict], guidelines: Dict[int, Dict], drugs: Dict[str, str],
                                 genes_filter: Optional[Set[str]] = None,
                                 accessed: Optional[str] = None) -> List[Document]:
    accessed = accessed or date.today().isoformat()
    groups: Dict[Tuple, List[Dict]] = {}
    for rec in recs:
        rec_text = _clean(rec.get("drugrecommendation"))
        if rec_text.lower() in _SKIP_RECOMMENDATION:
            continue
        if any("indeterminate" in str(v).lower() for v in (rec.get("phenotypes") or {}).values()):
            continue
        genes = _genes_of(rec)
        if genes_filter and not (genes & genes_filter):
            continue
        groups.setdefault(_group_key(rec), []).append(rec)

    docs = []
    for key, rows in groups.items():
        first = rows[0]
        g = guidelines.get(first.get("guidelineid"), {})
        drug = drugs.get(first.get("drugid"), str(first.get("drugid") or "")).lower()
        phen = first.get("phenotypes") or {}
        allele = first.get("allelestatus") or {}
        scores: Dict[str, Set[str]] = {}
        for r in rows:
            for gene, s in (r.get("activityscore") or {}).items():
                if _clean(s):
                    scores.setdefault(gene, set()).add(str(s))
        population = _clean(first.get("population"))

        lines = [f"CPIC guideline: {g.get('name', 'CPIC guideline')}.", f"Drug: {drug}."]
        if population and population.lower() != "general":
            lines.append(f"Population: {population}.")
        for gene, p in phen.items():
            if _clean(p):
                lines.append(f"{gene} phenotype: {p}.")
        for gene, a in allele.items():
            if _clean(a):
                lines.append(f"{gene} result: {a}.")
        for gene, s in scores.items():
            lines.append(f"{gene} activity score: {', '.join(sorted(s))}.")
        for gene, imp in (first.get("implications") or {}).items():
            if _clean(imp):
                lines.append(f"Implication ({gene}): {imp}")
        lines.append(f"Recommendation: {_clean(first.get('drugrecommendation'))}")
        if _clean(first.get("classification")):
            lines.append(f"Strength of recommendation: {_clean(first.get('classification'))}.")
        if _clean(first.get("comments")):
            lines.append(f"Comments: {_clean(first.get('comments'))}")

        label_bits = [f"{gn} {p}" for gn, p in phen.items() if _clean(p)] or \
                     [f"{a}" for a in allele.values() if _clean(a)]
        genes = sorted(_genes_of(first))
        digest = hashlib.sha1(json.dumps(key, default=str).encode()).hexdigest()[:10]
        docs.append(Document(
            doc_id=f"cpic:{drug}:{digest}",
            source="cpic",
            title=f"{drug.title()} · {', '.join(label_bits)[:120]} — CPIC",
            section="Recommendation" + (f" ({population})" if population and population.lower() != "general" else ""),
            url=g.get("url") or GUIDELINES_URL,
            text="\n".join(lines),
            tags={"drugs": [drug], "genes": genes},
            licence=LICENCE,
            version=f"CPIC recommendation v{first.get('version', 1)}; accessed {accessed}",
        ))
    return docs


def fetch(genes: str = "app", http: Optional[Http] = None, log=print) -> Tuple[List[Document], Dict]:
    """genes='app' keeps the genes this app supports (CYP2C19, SLCO1B1, HLA-B …); genes='all' keeps every CPIC gene."""
    http = http or Http(min_interval=0.2)
    guidelines = {g["id"]: g for g in _paged(http, "guideline", "id,name,url,genes")}
    drugs = {d["drugid"]: d["name"] for d in _paged(http, "drug", "drugid,name")}
    recs = _paged(http, "recommendation",
                  "id,guidelineid,drugid,implications,drugrecommendation,classification,phenotypes,"
                  "activityscore,allelestatus,population,comments,version")
    gf = None if genes == "all" else APP_GENE_SYMBOLS
    docs = recommendations_to_documents(recs, guidelines, drugs, genes_filter=gf)
    report = {"guidelines": len(guidelines), "drugs": len(drugs), "recommendation_rows": len(recs),
              "documents_after_dedup": len(docs)}
    log(f"  CPIC     {len(recs)} recommendation rows -> {len(docs)} distinct recommendations")
    return docs, report
