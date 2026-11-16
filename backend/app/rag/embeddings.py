"""Text -> vector.

LocalEmbedder   – BAAI/bge-small-en-v1.5 (MIT licence) through fastembed/ONNX on the CPU. Default.
                  Free, private (nothing leaves the machine), no daily limit; downloads ~70 MB once.
GeminiEmbedder  – gemini-embedding-001 via the free Gemini API tier, throttled to stay under free limits.
HashEmbedder    – deterministic bag-of-words hashing; ONLY for offline tests and demos without an API key.
                  It has no semantic understanding and must never be used for the real knowledge base.

Privacy: knowledge-base text (FDA/CPIC/MedlinePlus) is public. A user's question is also sent to Gemini to
embed it — the same as the existing chat already does. On the free tier Google may use submitted content
to improve its products, so the demo should use made-up (synthetic) patient data only.
"""
from __future__ import annotations

import hashlib
import os
import re
import time
from collections import deque
from typing import Deque, List, Optional, Sequence, Tuple

import numpy as np

from app.rag import config
from app.rag.chunking import estimate_tokens


class QuotaExhausted(RuntimeError):
    """The free daily quota (or this run's --max-texts budget) is used up. Progress is saved; run again later."""


def normalise(v: np.ndarray) -> np.ndarray:
    v = np.asarray(v, dtype=np.float32)
    n = float(np.linalg.norm(v))
    return v / n if n > 0 else v


class _Throttle:
    """Rolling 60-second budget for texts and tokens."""

    def __init__(self, texts_per_min: int, tokens_per_min: int):
        self.texts_per_min, self.tokens_per_min = texts_per_min, tokens_per_min
        self.events: Deque[Tuple[float, int, int]] = deque()

    def wait(self, n_texts: int, n_tokens: int, sleep=time.sleep, now=time.monotonic):
        while True:
            t = now()
            while self.events and t - self.events[0][0] >= 60:
                self.events.popleft()
            used_texts = sum(e[1] for e in self.events)
            used_tokens = sum(e[2] for e in self.events)
            if (used_texts + n_texts <= self.texts_per_min and used_tokens + n_tokens <= self.tokens_per_min) \
                    or not self.events:
                self.events.append((t, n_texts, n_tokens))
                return
            sleep(max(0.5, 60 - (t - self.events[0][0])))


class GeminiEmbedder:
    name = "gemini"

    def __init__(self, model: str = None, dim: int = None, max_texts: Optional[int] = None):
        self.model = model or config.EMBED_MODEL
        self.dim = dim or config.EMBED_DIM
        self.max_texts = max_texts
        self.texts_sent = 0
        self.tokens_sent = 0
        self.throttle = _Throttle(config.EMBED_TEXTS_PER_MIN, config.EMBED_TOKENS_PER_MIN)
        self._genai = None

    @property
    def model_id(self) -> str:
        return f"{self.model}@{self.dim}"

    def _client(self):
        if self._genai is None:
            import google.generativeai as genai
            key = os.getenv("GEMINI_API_KEY")
            if not key:
                raise RuntimeError("GEMINI_API_KEY is not set")
            genai.configure(api_key=key)
            self._genai = genai
        return self._genai

    def _call(self, contents, task_type: str, title: Optional[str] = None):
        genai = self._client()
        model_name = self.model if self.model.startswith("models/") else f"models/{self.model}"
        for attempt in range(4):
            try:
                kwargs = dict(model=model_name, content=contents, task_type=task_type,
                              output_dimensionality=self.dim, request_options={"timeout": 60})
                if title:
                    kwargs["title"] = title
                return genai.embed_content(**kwargs)["embedding"]
            except Exception as e:  # google.api_core.exceptions.* — keep the dependency soft
                msg = str(e)
                if "429" in msg or "ResourceExhausted" in type(e).__name__ or "quota" in msg.lower():
                    if re.search(r"per ?day|PerDay|daily", msg, re.I):
                        raise QuotaExhausted("Gemini free daily embedding quota reached: " + msg[:200])
                    if attempt < 3:
                        time.sleep(30 * (attempt + 1))
                        continue
                    raise QuotaExhausted("Gemini rate limit kept failing: " + msg[:200])
                if attempt < 2 and ("503" in msg or "500" in msg or "Deadline" in msg):
                    time.sleep(5 * (attempt + 1))
                    continue
                raise

    def embed_documents(self, items: Sequence[Tuple[str, str]]) -> List[np.ndarray]:
        """items: (title, text). Returns one normalised vector per item, in order."""
        out: List[np.ndarray] = []
        for i in range(0, len(items), config.EMBED_BATCH):
            batch = items[i:i + config.EMBED_BATCH]
            if self.max_texts is not None and self.texts_sent + len(batch) > self.max_texts:
                raise QuotaExhausted(f"Reached this run's budget of {self.max_texts} texts")
            tokens = sum(estimate_tokens(t) for _, t in batch)
            self.throttle.wait(len(batch), tokens)
            # Titles help retrieval quality for RETRIEVAL_DOCUMENT; prepend them because the batch call
            # takes one title per request.
            vecs = self._call([f"{title}\n{text}" for title, text in batch], "RETRIEVAL_DOCUMENT")
            self.texts_sent += len(batch)
            self.tokens_sent += tokens
            out.extend(normalise(v) for v in vecs)
        return out

    def embed_query(self, text: str) -> np.ndarray:
        self.throttle.wait(1, estimate_tokens(text))
        self.texts_sent += 1
        return normalise(self._call(text, "RETRIEVAL_QUERY"))


_WORD = re.compile(r"[a-z0-9]+")


class HashEmbedder:
    """Test-only embedder: hashed bag of words. No network, no semantics."""
    name = "hash"

    def __init__(self, dim: int = None, max_texts: Optional[int] = None):
        self.dim = dim or config.EMBED_DIM
        self.max_texts = max_texts
        self.texts_sent = 0
        self.tokens_sent = 0

    @property
    def model_id(self) -> str:
        return f"hash@{self.dim}"

    def _vec(self, text: str) -> np.ndarray:
        v = np.zeros(self.dim, dtype=np.float32)
        for w in _WORD.findall(text.lower()):
            h = int(hashlib.md5(w.encode()).hexdigest(), 16)
            v[h % self.dim] += 1.0 if (h >> 64) & 1 else -1.0
        return normalise(v)

    def embed_documents(self, items):
        if self.max_texts is not None and self.texts_sent + len(items) > self.max_texts:
            raise QuotaExhausted(f"Reached this run's budget of {self.max_texts} texts")
        self.texts_sent += len(items)
        self.tokens_sent += sum(estimate_tokens(x) for _, x in items)
        return [self._vec(f"{t}\n{x}") for t, x in items]

    def embed_query(self, text):
        self.texts_sent += 1
        return self._vec(text)


class LocalEmbedder:
    """bge-small-en-v1.5 on the CPU. BAAI recommends this instruction in front of search queries
    (not in front of passages)."""
    name = "local"
    QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

    def __init__(self, model: str = None, dim: int = None, max_texts: Optional[int] = None):
        self.model = model or config.LOCAL_EMBED_MODEL
        self.dim = dim or config.LOCAL_EMBED_DIM
        self.max_texts = None            # no quota to protect
        self.texts_sent = 0
        self.tokens_sent = 0
        self._m = None
        self._lock = __import__("threading").Lock()

    @property
    def model_id(self) -> str:
        return f"{self.model}@{self.dim}"

    def _model(self):
        with self._lock:
            if self._m is None:
                from fastembed import TextEmbedding
                config.MODEL_DIR.mkdir(parents=True, exist_ok=True)
                self._m = TextEmbedding(model_name=self.model, cache_dir=str(config.MODEL_DIR))
            return self._m

    def _embed(self, texts: List[str]) -> List[np.ndarray]:
        vecs = [normalise(v) for v in self._model().embed(texts, batch_size=32)]
        if vecs and vecs[0].shape[0] != self.dim:
            raise RuntimeError(f"{self.model} returned {vecs[0].shape[0]} dimensions, expected {self.dim}")
        return vecs

    def embed_documents(self, items):
        texts = [f"{t}\n{x}" for t, x in items]
        self.texts_sent += len(texts)
        self.tokens_sent += sum(estimate_tokens(t) for t in texts)
        return self._embed(texts)

    def embed_query(self, text):
        self.texts_sent += 1
        return self._embed([self.QUERY_PREFIX + text])[0]


def default_embedder(max_texts: Optional[int] = None):
    kind = os.getenv("RAG_EMBEDDER", config.EMBEDDER).lower()
    if kind == "hash":
        return HashEmbedder(max_texts=max_texts)
    if kind == "gemini":
        return GeminiEmbedder(max_texts=max_texts)
    return LocalEmbedder()
