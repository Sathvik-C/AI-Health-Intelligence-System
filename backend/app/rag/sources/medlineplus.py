"""MedlinePlus health-topic summaries -> Documents.

Files:   https://medlineplus.gov/xml.html lists daily files
         xml/mplus_topics_compressed_YYYY-MM-DD.zip  (and the uncompressed mplus_topics_YYYY-MM-DD.xml)
Format:  <health-topics><health-topic id url title language ...><also-called/><full-summary/>
         <mesh-heading><descriptor/></mesh-heading><group/>...</health-topic></health-topics>
Licence: the health-topic SUMMARIES are public domain. Only <full-summary> text is stored; drug pages
         (ASHP monographs), the A.D.A.M. encyclopedia and images are copyrighted and are NOT used.
         MedlinePlus asks that reuse says the information is from MedlinePlus.gov.
"""
from __future__ import annotations

import io
import re
import xml.etree.ElementTree as ET
import zipfile
from typing import Dict, Iterable, List, Optional, Tuple

from app.rag import config
from app.rag.chunking import clean_text
from app.rag.sources.common import Document, Http
from app.rag.vocab import find_drugs, find_genes

LICENCE = "Public domain – MedlinePlus.gov (NLM)"

DEFAULT_TOPIC_KEYWORDS = [
    "diabetes", "prediabetes", "a1c", "blood sugar", "cholesterol", "triglycerides", "kidney", "liver",
    "hepatitis", "thyroid", "high blood pressure", "hypertension", "anemia", "obesity", "weight",
    "metabolic syndrome", "heart disease", "coronary artery", "heart attack", "stroke", "gout", "vitamin d",
    "vitamin b", "potassium", "lab tests", "blood count", "pharmacogenomic", "genetic testing", "medicines",
    "drug safety", "medication", "exercise", "nutrition", "smoking",
]

_ZIP = re.compile(r"mplus_topics_compressed_(\d{4}-\d{2}-\d{2})\.zip")
_XML = re.compile(r"mplus_topics_(\d{4}-\d{2}-\d{2})\.xml")


def latest_file(page_html: str) -> Optional[Tuple[str, str]]:
    """(file name, date) of the newest topics file listed on xml.html; prefers the zip."""
    zips = sorted(set(_ZIP.findall(page_html)))
    if zips:
        return f"mplus_topics_compressed_{zips[-1]}.zip", zips[-1]
    xmls = sorted(set(_XML.findall(page_html)))
    if xmls:
        return f"mplus_topics_{xmls[-1]}.xml", xmls[-1]
    return None


def _matches(texts: Iterable[str], keywords: List[str]) -> bool:
    low = " | ".join(t.lower() for t in texts if t)
    return any(re.search(r"(?<![a-z])" + re.escape(k.lower()) + r"(?![a-z])", low) for k in keywords)


def parse_topics(xml_stream, keywords: Optional[List[str]] = None, file_date: str = "") -> List[Document]:
    """Stream-parse the topics XML; keep English topics whose title/also-called/MeSH match a keyword."""
    docs: List[Document] = []
    for _, elem in ET.iterparse(xml_stream, events=("end",)):
        if elem.tag != "health-topic":
            continue
        try:
            if (elem.get("language") or "English") != "English":
                continue
            title = (elem.get("title") or (elem.text or "")).strip()
            also = [a.text.strip() for a in elem.findall("also-called") if a.text]
            mesh = [d.text.strip() for d in elem.findall("mesh-heading/descriptor") if d.text]
            if keywords and not _matches([title, *also, *mesh], keywords):
                continue
            summary_el = elem.find("full-summary")
            if summary_el is None:
                continue
            summary = clean_text(ET.tostring(summary_el, encoding="unicode"))
            if len(summary) < 80:
                continue
            tid = elem.get("id") or title.lower().replace(" ", "-")
            docs.append(Document(
                doc_id=f"medlineplus:{tid}",
                source="medlineplus",
                title=f"{title} — MedlinePlus",
                section="Health topic summary",
                url=elem.get("url") or "https://medlineplus.gov/",
                text=summary,
                tags={"topics": [title, *also][:6], "drugs": sorted(find_drugs(summary)),
                      "genes": sorted(find_genes(summary))},
                licence=LICENCE,
                version=f"MedlinePlus XML {file_date}".strip(),
            ))
        finally:
            elem.clear()
    return docs


def fetch(keywords: Optional[List[str]] = None, http: Optional[Http] = None, log=print) -> Tuple[List[Document], Dict]:
    http = http or Http()
    keywords = DEFAULT_TOPIC_KEYWORDS if keywords is None else keywords
    page = http.get(config.MEDLINEPLUS_XML_PAGE)
    page.raise_for_status()
    found = latest_file(page.text)
    if not found:
        raise RuntimeError("Could not find a health-topics XML file on " + config.MEDLINEPLUS_XML_PAGE)
    name, file_date = found
    r = http.get(config.MEDLINEPLUS_XML_BASE + name)
    r.raise_for_status()
    if name.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            member = next(n for n in z.namelist() if n.endswith(".xml"))
            with z.open(member) as f:
                docs = parse_topics(f, keywords, file_date)
    else:
        docs = parse_topics(io.BytesIO(r.content), keywords, file_date)
    log(f"  MedlinePlus {name}: {len(docs)} matching English health topics")
    return docs, {"file": name, "topics": len(docs), "keywords": keywords}
