"""Retrieval-augmented generation (RAG) for Ask Your Health Record.

Knowledge base (public, free to use):
  * openFDA drug labels      – CC0 public domain        (sources/openfda.py)
  * CPIC gene–drug guidance  – CC0 1.0                   (sources/cpic.py)
  * MedlinePlus summaries    – public-domain parts only  (sources/medlineplus.py)

Pipeline:  fetch -> chunk -> embed (Gemini, free-tier throttled) -> store (pgvector, numpy fallback)
           question -> retrieve -> Gemini answer citing S#/F# -> validate citations -> show sources

See docs/RAG.md for setup, licences, free-tier limits and evaluation.
"""
