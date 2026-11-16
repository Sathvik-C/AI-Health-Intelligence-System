from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import httpx

from app.rag import config


@dataclass
class Document:
    """One source section, before chunking (e.g. the 'Contraindications' section of one FDA label)."""
    doc_id: str                 # stable id, e.g. "openfda:metformin:contraindications"
    source: str                 # openfda | cpic | medlineplus
    title: str                  # what the user sees on the citation card
    section: str
    url: str
    text: str
    tags: Dict[str, List[str]] = field(default_factory=dict)   # drugs / genes / topics
    licence: str = ""
    version: str = ""           # label effective date, CPIC version + access date, MedlinePlus file date

    def to_dict(self) -> Dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Dict) -> "Document":
        return cls(**{k: d.get(k) for k in cls.__dataclass_fields__ if k in d})


def write_jsonl(path: Path, docs: Iterable[Document]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(path, "w", encoding="utf-8") as f:
        for d in docs:
            f.write(json.dumps(d.to_dict(), ensure_ascii=False) + "\n")
            n += 1
    return n


def read_jsonl(path: Path) -> List[Document]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return [Document.from_dict(json.loads(line)) for line in f if line.strip()]


class Http:
    """Small polite HTTP client: retries with back-off, identifies itself, never sends user data."""

    def __init__(self, min_interval: float = 0.3):
        self.client = httpx.Client(timeout=config.HTTP_TIMEOUT, follow_redirects=True,
                                   headers={"User-Agent": config.USER_AGENT})
        self.min_interval = min_interval
        self._last = 0.0

    def get(self, url: str, params: Optional[Dict] = None, retries: int = 3) -> httpx.Response:
        for attempt in range(retries + 1):
            wait = self.min_interval - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            try:
                r = self.client.get(url, params=params)
            except httpx.HTTPError:
                if attempt == retries:
                    raise
                time.sleep(2 ** attempt)
                continue
            if r.status_code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(2 ** (attempt + 1))
                continue
            return r
        return r  # pragma: no cover

    def close(self):
        self.client.close()
