"""All RAG settings in one place. Every value can be overridden with an environment variable."""
import os
from pathlib import Path


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


# --- Embeddings ------------------------------------------------------------------
# local  (default): BAAI/bge-small-en-v1.5 via fastembed (ONNX, CPU) — free, no API calls, no daily limit
# gemini          : gemini-embedding-001 via the Gemini API (free tier ≈1,000 texts/day)
# hash            : tests only
EMBEDDER = os.getenv("RAG_EMBEDDER", "local").lower()
LOCAL_EMBED_MODEL = os.getenv("RAG_LOCAL_EMBED_MODEL", "BAAI/bge-small-en-v1.5")
LOCAL_EMBED_DIM = _int("RAG_LOCAL_EMBED_DIM", 384)
EMBED_MODEL = os.getenv("RAG_EMBED_MODEL", "gemini-embedding-001")
EMBED_DIM = _int("RAG_EMBED_DIM", LOCAL_EMBED_DIM if EMBEDDER == "local" else 768)   # vectors are L2-normalised

# Free-tier guard rails. Google's published free limits for gemini-embedding-001 were
# 100 requests/min, 30k tokens/min, 1k requests/day at the time of writing; we stay below them.
# Google does not document whether one batch call counts as one request or one per text,
# so we count every text as a request (the stricter reading).
EMBED_TEXTS_PER_MIN = _int("RAG_EMBED_TEXTS_PER_MIN", 90)
EMBED_TOKENS_PER_MIN = _int("RAG_EMBED_TOKENS_PER_MIN", 25_000)
EMBED_MAX_TEXTS_PER_RUN = _int("RAG_EMBED_MAX_TEXTS_PER_RUN", 900)
EMBED_BATCH = _int("RAG_EMBED_BATCH", 20)

# --- Vector store --------------------------------------------------------------
# auto: pgvector when the database is PostgreSQL with the extension available, else numpy.
VECTOR_BACKEND = os.getenv("RAG_VECTOR_BACKEND", "auto")   # auto | pgvector | numpy

# --- Retrieval -----------------------------------------------------------------
TOP_K = _int("RAG_TOP_K", 6)
VECTOR_CANDIDATES = _int("RAG_VECTOR_CANDIDATES", 40)
MAX_CHUNKS_PER_DOC = _int("RAG_MAX_CHUNKS_PER_DOC", 2)
MIN_SCORE = _float("RAG_MIN_SCORE", 0.35)     # tune with the evaluation set
ENTITY_BOOST = _float("RAG_ENTITY_BOOST", 0.15)
KEYWORD_BOOST = _float("RAG_KEYWORD_BOOST", 0.10)

# --- Answering -----------------------------------------------------------------
ANSWER_MODEL = os.getenv("RAG_ANSWER_MODEL") or os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
# Citation check 3 ("does the source support the sentence?"):
#   lexical (default; also "1"): Python word-overlap + negation check — no API call
#   gemini: a second, strict Gemini call      off (or "0"): skip check 3
_ent = os.getenv("RAG_ENTAILMENT", "lexical").strip().lower()
ENTAILMENT_MODE = "off" if _ent in ("0", "off", "false", "no") else ("gemini" if _ent == "gemini" else "lexical")
ENTAILMENT_CHECK = ENTAILMENT_MODE != "off"
SUPPORT_MIN = _float("RAG_SUPPORT_MIN", 0.6)    # share of a claim's content words found in its sources
MAX_CLAIMS = _int("RAG_MAX_CLAIMS", 5)
MIN_SURVIVAL = _float("RAG_MIN_SURVIVAL", 0.5)   # below this share of surviving claims -> no answer

# --- Chunking --------------------------------------------------------------------
CHUNK_WORDS = _int("RAG_CHUNK_WORDS", 280)
CHUNK_OVERLAP_WORDS = _int("RAG_CHUNK_OVERLAP_WORDS", 40)

# --- Data folders ----------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("RAG_DATA_DIR", BACKEND_DIR / "data" / "kb"))
RAW_DIR = DATA_DIR / "raw"
MODEL_DIR = Path(os.getenv("RAG_MODEL_DIR", BACKEND_DIR / "data" / "models"))   # local embedding model cache

# --- Sources ---------------------------------------------------------------------
OPENFDA_URL = os.getenv("OPENFDA_URL", "https://api.fda.gov/drug/label.json")
OPENFDA_API_KEY = os.getenv("OPENFDA_API_KEY", "")     # optional, free; raises the daily limit
CPIC_API = os.getenv("CPIC_API", "https://api.cpicpgx.org/v1")
MEDLINEPLUS_XML_PAGE = os.getenv("MEDLINEPLUS_XML_PAGE", "https://medlineplus.gov/xml.html")
MEDLINEPLUS_XML_BASE = os.getenv("MEDLINEPLUS_XML_BASE", "https://medlineplus.gov/xml/")
HTTP_TIMEOUT = _float("RAG_HTTP_TIMEOUT", 60.0)
USER_AGENT = "AI-Health-Intelligence-System/1.0 (college project; RAG knowledge-base builder)"
