# Ask Your Health Record — RAG (retrieval-augmented generation)

## What it does

**In plain words.** The app keeps a small library of trusted medical leaflets: official FDA drug labels,
CPIC gene–drug guidelines and MedlinePlus health-topic summaries. When you ask a question, it finds the right
pages in that library, adds what it already knows from your own reports, and asks the AI to answer using only
those pages. Every sentence shows numbered sources you can open. A checker removes any sentence its source does
not back up, and if nothing reliable is left, the app says so instead of guessing.

**Technically.** Public documents are chunked (~280 words), embedded on the CPU with the local model
**BAAI/bge-small-en-v1.5** (384 dims, MIT licence, via fastembed/ONNX) and stored in PostgreSQL with **pgvector**
(HNSW, cosine). A question is embedded, matched by a
hybrid score (vector similarity + drug/gene tag match + keyword overlap), and the top passages (`S1…Sn`) are
sent to Gemini together with the app's computed facts about the user (`F1…Fn`, the same facts AI Insights
uses). Gemini returns JSON claims with citation IDs (the **only** Gemini call per question); a 4-layer validator written
in Python drops unsupported claims before display.

```
 build once (offline)                         every question (online)
 ───────────────────                          ───────────────────────
 openFDA / CPIC / MedlinePlus                 question ──► embed (local, + BGE query prefix)
        │ fetch (free, public domain)                     │
        ▼                                                 ▼
 chunk + tag (drug, gene, topic)              hybrid retrieve top-6  ◄── pgvector / numpy
        │                                                 │
        ▼                                     + your facts F1…Fn (labs, medicines, PGx, calculators)
 embed (local bge-small, CPU)                             ▼
        │                                     Gemini → claims with cites [S2, F5]
        ▼                                                 ▼
 kb_chunks table (+ embedding_vec)            validator (4 checks) → answer + source cards
```

## Data sources and licences (all free — nothing to buy or sign)

| Source | What we store | Licence / terms | Attribution shown |
|---|---|---|---|
| [openFDA drug labels](https://open.fda.gov/apis/drug/label/) | Boxed warning, indications, dosage, contraindications, warnings & precautions, adverse reactions (first ~700 words), interactions, specific populations, pharmacogenomics | Public domain (CC0). Optional free API key raises the daily limit | "Drug label text from openFDA (U.S. FDA)" + DailyMed link |
| [CPIC](https://cpicpgx.org/) via `api.cpicpgx.org/v1` | Gene–drug recommendations for the genes this app supports | CC0 1.0. CPIC asks you to cite URL, date accessed and version | Guideline link + "CPIC recommendation vN; accessed YYYY-MM-DD" |
| [MedlinePlus XML](https://medlineplus.gov/xml.html) | Health-topic **summaries** only, for topics matching our keyword list | Summaries are public domain | "Information is from MedlinePlus.gov" |

**Deliberately not used:** MedlinePlus drug pages (ASHP monographs) and the A.D.A.M. encyclopedia (copyrighted;
MedlinePlus forbids ingesting copyrighted content into health IT systems); the ClinPGx API (CC BY-SA 4.0
share-alike); the Kaggle `personalized_medication_dataset.csv` (synthetic/random — unsafe as medical knowledge).

## Set up (Docker)

```bash
# 1. Start with the pgvector database image (first time only: fresh volume, re-register and re-upload reports)
docker-compose up --build

# 2. Download the public documents (needs internet; ~2–5 minutes)
docker-compose exec backend python -m app.rag.ingest fetch

# 3. See exactly how many chunks/tokens/runs it will take — no API calls
docker-compose exec backend python -m app.rag.ingest build --dry-run

# 4. Embed + store with the local model (no API calls; first run downloads ~70 MB to backend/data/models)
docker-compose exec backend python -m app.rag.ingest build

# 5. Check
docker-compose exec backend python -m app.rag.ingest stats
```

Then open **Ask Your Health Record** — the header shows "Reference library: N passages".

Useful options: `fetch --source cpic`, `fetch --drugs metformin,amlodipine`, `fetch --include-user-medicines`,
`fetch --cpic-genes all`, `fetch --topics "diabetes,kidney"`, `build --max-texts 500`, `reset --source medlineplus`.

### Moving data from the old database (optional)
The previous `postgres:16-alpine` volume (`pgdata`) is kept, not deleted. To copy it into the new database:
```bash
docker run --rm -v healthapp_pgdata:/var/lib/postgresql/data -e POSTGRES_PASSWORD=x -d --name olddb postgres:16-alpine
docker exec olddb pg_dump -U health_user -d health_db > old.sql
docker-compose exec -T db psql -U health_user -d health_db < old.sql
docker stop olddb
```
(The volume name prefix depends on your folder name — check with `docker volume ls`.)
Rollback: change the `db` image back to `postgres:16-alpine` and the volume back to `pgdata`.

## What it costs

| Item | Cost | Why |
|---|---|---|
| pgvector | ₹0 | Open-source PostgreSQL extension; runs inside the existing Postgres container |
| Storage | ₹0 | A few MB: each chunk is 768 × 4 bytes ≈ 3 KB of vector + its text |
| Source data | ₹0 | Public-domain / CC0 downloads |
| Embeddings | ₹0, no daily limit | Local model on the CPU; nothing is sent anywhere |
| Each question | 1 Gemini call | Search and citation checks run in Python; only the answer is written by Gemini |

Optional: `RAG_EMBEDDER=gemini` switches back to `gemini-embedding-001`. On the free tier that model allowed
about 1,000 texts per day (measured: the build stopped at exactly 1,000), so a full build takes 4 days;
`build` throttles itself and resumes.

**Privacy.** On the free tier Google may use submitted content to improve its products. The knowledge base is
public text, so that is fine — but questions and the user's facts are also sent (as the existing chat and AI
Insights already do). Use made-up (synthetic) patients for demos; never real patient data on the free tier.

## How citations are validated (`app/rag/validator.py`)

| # | Check | Plain words | Fails when |
|---|---|---|---|
| 1 | IDs exist | No made-up footnotes | A cite isn't one of the S#/F# sent in this request |
| 2 | Numbers & names | Quoted numbers/drugs/genes must be in the source | e.g. claim says "eGFR 45", source says 30 |
| 3 | Support | Most of the sentence's words must be in the source, and an "avoid / not recommended" sentence needs a caution word in the source | Python word-overlap check (`RAG_ENTAILMENT=lexical`, default) or a strict Gemini judge (`RAG_ENTAILMENT=gemini`) says partial/unsupported |
| 4 | Source type | Medicine rules from official drug documents; your numbers from your records | A dosing/avoid claim cites only MedlinePlus; "your X is N" cites no F# |

Answer-level rule: if the first (main) claim fails, fewer than half survive, or the model says the sources
don't cover it → the user sees *"I couldn't find a sourced answer… please ask your doctor or pharmacist"* plus
the closest passages to read. With the optional Gemini judge, if that call fails, checks 1, 2 and 4 still apply
and the UI says the second check was unavailable.

## Evaluation (for the project report)

```bash
docker-compose exec backend python -m app.rag.evaluate --retrieval-only   # cheap: retrieval hit@6, MRR
docker-compose exec backend python -m app.rag.evaluate                    # full: 1 answer call + 1 judge call per question
docker-compose exec backend python -m app.rag.evaluate --judge lexical    # grade with the app's own Python check
```
The 34-question set (`backend/app/rag/eval/eval_set.jsonl`) has 28 answerable questions (12 FDA label,
10 CPIC, 6 MedlinePlus) and 6 out-of-scope ones that must be refused. Reports are written to
`backend/data/kb/eval_report.json` and `.md`.

| Metric | Meaning |
|---|---|
| retrieval hit@6 / MRR | Is a correct passage in the top 6, and how high? |
| answered rate | Answerable questions that received a sourced answer |
| refusal accuracy | Out-of-scope questions correctly refused |
| citation recall | Claims citing at least one real source |
| unsupported before validator | Share of the model's claims the judge rejects — what users would have seen without the validator |

Limitation: the default judge is Gemini (an AI grading an AI); hand-check ~20 claims from the report. Compare
`--judge gemini` with `--judge lexical` to show how close the Python check is to an AI judge. Add questions to the
JSONL as you find failures, and tune `RAG_MIN_SCORE` / `RAG_ENTITY_BOOST` against hit@6.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `RAG_EMBEDDER` | `local` | `local` (bge-small, 384 dims), `gemini` (gemini-embedding-001, 768 dims), `hash` (tests). Switching is handled by `ingest build`, which resizes the vector column and re-embeds |
| `RAG_VECTOR_BACKEND` | `auto` | `pgvector`, `numpy`, or auto-detect (falls back to numpy if the extension is missing) |
| `RAG_TOP_K` | `6` | Passages sent to Gemini |
| `RAG_MIN_SCORE` | `0.35` | Drop weak vector matches with no drug/gene match |
| `RAG_ENTAILMENT` | `lexical` | Check 3: `lexical` (Python), `gemini` (extra call) or `off` |
| `RAG_SUPPORT_MIN` | `0.6` | Share of a sentence's content words that must appear in its source |
| `RAG_EMBED_MAX_TEXTS_PER_RUN` | `900` | Daily budget guard, only used with `RAG_EMBEDDER=gemini` |
| `OPENFDA_API_KEY` | empty | Optional free key |

## Known gaps

- Built and tested offline: parsers were checked against the published formats (openFDA field list, CPIC
  database schema, MedlinePlus XML description) using synthetic fixtures; the first real `fetch` should be
  watched for errors.
- FDA labels exist only for US-approved medicines; India-only generics (e.g. teneligliptin) and Indian brand
  names (e.g. "Glycomet") are not covered yet.
- MedlinePlus lab-test pages are not in the XML feed, so lab explanations come from health-topic summaries.
- The user's raw report text is not indexed; personal answers use the app's computed facts instead.
- Thresholds are defaults, not tuned — use the evaluation set.
- The local model is smaller than Gemini's embedding model; measure retrieval with `evaluate --retrieval-only`.
- The Python support check is stricter about wording than an AI judge: a correct sentence that paraphrases heavily
  can be removed. The answer prompt asks Gemini to reuse the source's words to reduce this.
- Educational tool: it never tells anyone to start, stop or change a medicine.
