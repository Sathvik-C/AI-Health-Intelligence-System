"""Knowledge-base fetchers. Each returns a list of `Document`s and never needs an account or payment."""
from app.rag.sources.common import Document, read_jsonl, write_jsonl  # noqa: F401

SOURCE_INFO = {
    "openfda": {
        "label": "FDA drug label",
        "licence": "Public domain (CC0) – openFDA / U.S. FDA",
        "attribution": "Drug label text from openFDA (U.S. Food and Drug Administration).",
    },
    "cpic": {
        "label": "CPIC guideline",
        "licence": "CC0 1.0 – Clinical Pharmacogenetics Implementation Consortium",
        "attribution": "Gene–drug guidance from CPIC, cpicpgx.org (cite URL, date accessed and version).",
    },
    "medlineplus": {
        "label": "MedlinePlus",
        "licence": "Public domain – MedlinePlus health-topic summaries (NLM)",
        "attribution": "Information is from MedlinePlus.gov.",
    },
}
