"""Citation validator — every sentence the AI writes must be backed by the passages it cites.

Four layers, cheapest first:
  1. IDs exist        – each cite must be an S#/F# that was actually sent in this request.
  2. Numbers & names  – every number, drug and gene in the claim must appear in the cited text.
  3. Support          – default: Python word-overlap + negation check (lexical_entail, no API call);
                        optional: a second, strict Gemini call (RAG_ENTAILMENT=gemini).
  4. Source type      – medicine rules need an FDA label / CPIC passage (or the app's own PGx / drug–lab
                        check); statements about "your" values need one of the user's own facts (F#).

Plain words: no made-up footnotes; quoted numbers must be in the source; a second reviewer confirms the
source really says it; medicine rules come from official drug documents, your numbers from your records.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Sequence, Set, Tuple

from app.rag.vocab import find_drugs, find_genes

CITE_ID = re.compile(r"^[SF]\d{1,3}$")
_INLINE_CITE = re.compile(r"\s*[\[(]\s*(?:[SF]\d{1,3}\s*[,;]?\s*)+[\])]")
_CLAIM_NUM = re.compile(r"(?<![A-Za-z0-9*:.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?![A-Za-z]\d)")
_SOURCE_NUM = re.compile(r"\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?")
_TYPE_N = re.compile(r"\btype\s+([12])\b", re.I)
_ACTION = re.compile(
    r"\b(dos(e|es|age|ing)|mg\b|contraindicat\w*|avoid\w*|do not (use|take|give)|should not|not recommended|"
    r"stop\w*|discontinu\w*|start\w*|initiat\w*|switch\w*|alternative|reduc\w* the dose|increas\w* the dose|"
    r"lower (starting )?dose|adjust\w*|monitor\w*)", re.I)
_YOUR = re.compile(r"\b(your|you)\b", re.I)

MEDICATION_SOURCES = {"openfda", "cpic"}
MEDICATION_FACT_CATEGORIES = {"pgx", "drug_lab"}

DROP_REASONS = {
    "no_valid_citation": "cited no source that was provided (made-up or missing citation)",
    "number_not_in_source": "contains a number that is not in the cited source",
    "name_not_in_source": "mentions a drug or gene that is not in the cited source",
    "medication_rule_without_official_source": "medicine rule not backed by an FDA label or CPIC passage",
    "personal_value_without_user_fact": "statement about your values that does not cite your records",
    "not_entailed": "second check: the cited source does not fully support it",
}


@dataclass
class Passage:
    id: str
    text: str
    source: str                   # openfda | cpic | medlineplus | user
    tags: Dict = field(default_factory=dict)
    category: str = ""            # for user facts (F#): biomarker, pgx, drug_lab …
    title: str = ""               # source title + section, used as extra evidence words


@dataclass
class ClaimResult:
    text: str
    cites: List[str]
    kept: bool = True
    reason: str = ""
    verdict: str = ""


def clean_claim_text(text: str) -> str:
    return _INLINE_CITE.sub("", str(text or "")).strip()


def _num(s: str) -> Optional[float]:
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def claim_numbers(text: str) -> List[float]:
    skip = {m.start(1) for m in _TYPE_N.finditer(text)}
    out = []
    for m in _CLAIM_NUM.finditer(text):
        if m.start(1) in skip:
            continue
        v = _num(m.group(1))
        if v is not None:
            out.append(v)
    return out


def source_numbers(text: str) -> Set[float]:
    return {v for v in (_num(m.group(0)) for m in _SOURCE_NUM.finditer(text)) if v is not None}


def is_medication_rule(text: str) -> bool:
    return bool(find_drugs(text)) and bool(_ACTION.search(text))


def check_claim(text: str, cites: Sequence[str], passages: Dict[str, Passage]) -> Tuple[List[str], str]:
    """Deterministic checks 1, 2 and 4. Returns (valid cite ids, reason or '')."""
    valid = [c for c in dict.fromkeys(str(c).strip().upper() for c in cites or []) if CITE_ID.match(c) and c in passages]
    if not valid:
        return [], "no_valid_citation"
    cited = [passages[c] for c in valid]
    blob = "\n".join(p.text for p in cited)

    # 2a. numbers
    nums = source_numbers(blob)
    for v in claim_numbers(text):
        if not any(abs(v - s) <= 1e-9 * max(1.0, abs(v)) for s in nums):
            return valid, "number_not_in_source"

    # 2b. drug and gene names
    blob_low = blob.lower()
    known_drugs = find_drugs(blob)
    for p in cited:
        known_drugs |= {d.lower() for d in (p.tags.get("drugs") or []) + (p.tags.get("mentioned_drugs") or [])}
    for d in find_drugs(text):
        if d not in known_drugs and d not in blob_low:
            return valid, "name_not_in_source"
    known_genes = {g.split("*")[0] for g in find_genes(blob)}
    for p in cited:
        known_genes |= {str(g).upper().split("*")[0] for g in p.tags.get("genes") or []}
    for g in find_genes(text):
        if g.split("*")[0] not in known_genes:
            return valid, "name_not_in_source"

    # 4. source type
    if is_medication_rule(text) and not any(
            p.source in MEDICATION_SOURCES or (p.source == "user" and p.category in MEDICATION_FACT_CATEGORIES)
            for p in cited):
        return valid, "medication_rule_without_official_source"
    if _YOUR.search(text) and claim_numbers(text) and not any(p.source == "user" for p in cited):
        return valid, "personal_value_without_user_fact"
    return valid, ""


EntailFn = Callable[[List[Dict]], Dict[str, str]]


def validate(raw_claims: Sequence[Dict], passages: Dict[str, Passage], entail: Optional[EntailFn] = None,
             max_claims: int = 5) -> Tuple[List[ClaimResult], Dict]:
    """Run all checks. Returns (results in original order, info)."""
    results: List[ClaimResult] = []
    for rc in list(raw_claims or [])[:max_claims * 2]:
        if not isinstance(rc, dict):
            continue
        text = clean_claim_text(rc.get("text", ""))
        if not text:
            continue
        cites, reason = check_claim(text, rc.get("cites") or rc.get("citations") or [], passages)
        results.append(ClaimResult(text=text, cites=cites, kept=not reason, reason=reason))
    results = results[:max_claims]

    info = {"proposed": len(results), "entailment": "skipped"}
    survivors = [r for r in results if r.kept]
    if entail and survivors:
        payload = [{"id": f"C{i + 1}", "claim": r.text,
                    "evidence": "\n---\n".join(f"{passages[c].title}\n{passages[c].text[:2500]}" for c in r.cites)}
                   for i, r in enumerate(survivors)]
        try:
            verdicts = entail(payload) or {}
            for i, r in enumerate(survivors):
                v = str(verdicts.get(f"C{i + 1}", "unsupported")).lower()
                r.verdict = v
                if v != "supported":
                    r.kept, r.reason = False, "not_entailed"
            info["entailment"] = "passed"
        except Exception as e:  # keep deterministic result, but say so
            info["entailment"] = "unavailable"
            info["entailment_error"] = str(e)[:200]
    info["kept"] = sum(r.kept for r in results)
    info["dropped"] = [{"text": r.text, "reason": r.reason, "why": DROP_REASONS.get(r.reason, r.reason)}
                       for r in results if not r.kept]
    return results, info


# --------------------------------------------------------------------------- check 3 without AI
_WORD = re.compile(r"[a-z0-9]+(?:[.\-][a-z0-9]+)*")
_GENERIC = set("""a an and are as at be been but by can could did do does for from had has have how i if in into is
it its me my of on or our should so than that the their them then there these they this to was we what when where
which who why will with would you your about also may might per such any some more most other than very just only
label labels source sources says say states stated lists listed list mentions mentioned according guideline guidelines
cpic fda medlineplus recommends recommend recommended recommendation note notes information people person patients
patient someone using use used take taking taken""".split())
_SUFFIXES = ("ations", "ation", "ings", "ing", "ions", "ion", "ed", "es", "s", "ly")
_NEG_CLAIM = re.compile(r"\b(avoid\w*|not recommended|contraindicat\w*|should not|do not|must not|never|stop\w*|"
                        r"discontinu\w*|alternative)\b", re.I)
_NEG_SOURCE = re.compile(r"\b(avoid\w*|not|no|contraindicat\w*|alternative|discontinu\w*|caution|warning|risk|"
                         r"reduc\w*|lower|limit\w*|stop\w*|do not|should not)\b", re.I)
_ADVICE_ONLY = re.compile(r"\b(discuss|ask|talk|consult|check with|speak|review)\b.*\b(doctor|pharmacist|clinician|"
                          r"physician|dietitian|healthcare|care team)\b", re.I)


def _stem(w: str) -> str:
    for suf in _SUFFIXES:
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            return w[: -len(suf)]
    return w


def _content_stems(text: str) -> List[str]:
    return [_stem(w) for w in _WORD.findall((text or "").lower()) if w not in _GENERIC and len(w) > 1]


def support_score(claim: str, evidence: str) -> float:
    words = set(_content_stems(claim))
    if not words:
        return 1.0
    ev = set(_content_stems(evidence))
    return len(words & ev) / len(words)


def lexical_entail(items: List[Dict], threshold: float = None) -> Dict[str, str]:
    """Python stand-in for the Gemini judge (no API call).
    supported   – ≥ threshold of the claim's content words (stemmed) appear in its cited evidence, and a
                  'avoid / not recommended' claim is backed by evidence that also contains a caution word;
    partial     – some overlap but below the threshold;  unsupported – little overlap or direction mismatch.
    Pure advice sentences ("discuss this with your doctor") with no numbers/drugs/genes are allowed."""
    from app.rag import config
    threshold = config.SUPPORT_MIN if threshold is None else threshold
    out = {}
    for it in items:
        claim, ev = it.get("claim", ""), it.get("evidence", "")
        if _ADVICE_ONLY.search(claim) and not claim_numbers(claim) and not find_drugs(claim) and not find_genes(claim):
            out[it["id"]] = "supported"
            continue
        if _NEG_CLAIM.search(claim) and not _NEG_SOURCE.search(ev):
            out[it["id"]] = "unsupported"
            continue
        score = support_score(claim, ev)
        out[it["id"]] = "supported" if score >= threshold else ("partial" if score >= threshold * 0.6 else "unsupported")
    return out
