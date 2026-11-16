"""Split long source text into retrieval-sized passages.

Rules:
  * clean whitespace and HTML;
  * prefer to cut at label sub-section numbers ("5.1 Lactic Acidosis") and sentence ends;
  * ~280 words per chunk with ~40 words of overlap so a fact cut in half still appears whole once.
"""
from __future__ import annotations

import html
import re
from typing import List

from app.rag import config

_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")
# FDA labels number sub-sections inline: "... 5.2 Hypoglycemia ..." (also "12.5 Pharmacogenomics")
_SUBSECTION = re.compile(r"(?<=[\s.])(?=\d{1,2}\.\d{1,2}\s+[A-Z][a-zA-Z])")
_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z(\[])")


def clean_text(text: str) -> str:
    text = html.unescape(text or "")
    text = _TAG.sub(" ", text)
    return _WS.sub(" ", text).strip()


def _split_long(piece: str, max_words: int) -> List[str]:
    """Split a block into sentence-aligned windows of at most max_words."""
    sentences = _SENTENCE.split(piece)
    out, cur = [], []
    for s in sentences:
        words = s.split()
        if len(words) > max_words:  # pathological sentence (tables flattened to text)
            if cur:
                out.append(" ".join(cur))
                cur = []
            for i in range(0, len(words), max_words):
                out.append(" ".join(words[i:i + max_words]))
            continue
        if len(cur) + len(words) > max_words and cur:
            out.append(" ".join(cur))
            cur = []
        cur.extend(words)
    if cur:
        out.append(" ".join(cur))
    return out


def chunk_text(text: str, max_words: int = None, overlap_words: int = None) -> List[str]:
    max_words = max_words or config.CHUNK_WORDS
    overlap_words = config.CHUNK_OVERLAP_WORDS if overlap_words is None else overlap_words
    text = clean_text(text)
    if not text:
        return []
    if len(text.split()) <= max_words:
        return [text]

    blocks = [b.strip() for b in _SUBSECTION.split(text) if b.strip()]
    pieces: List[str] = []
    for b in blocks:
        pieces.extend(_split_long(b, max_words))

    # Greedily merge small neighbouring pieces up to max_words.
    merged: List[str] = []
    for p in pieces:
        if merged and len(merged[-1].split()) + len(p.split()) <= max_words:
            merged[-1] = merged[-1] + " " + p
        else:
            merged.append(p)

    # Add overlap from the previous chunk's tail.
    if overlap_words <= 0 or len(merged) == 1:
        return merged
    out = [merged[0]]
    for prev, cur in zip(merged, merged[1:]):
        tail = prev.split()[-overlap_words:]
        out.append("… " + " ".join(tail) + " " + cur)
    return out


def estimate_tokens(text: str) -> int:
    """Rough token count (≈4 characters per token for English)."""
    return max(1, len(text) // 4)
