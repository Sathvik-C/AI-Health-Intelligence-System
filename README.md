# 🏥 Health Intelligence App

A full-stack AI-powered health analytics platform with biomarker tracking, forecasting, risk scoring, and a context-aware AI health chatbot.

---

## 🗂 Project Structure

```
healthapp/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entrypoint
│   │   ├── database.py          # SQLAlchemy setup
│   │   ├── models/models.py     # DB models (User, Report, Biomarker, etc.)
│   │   ├── routers/             # API route handlers
│   │   │   ├── auth.py
│   │   │   ├── reports.py
│   │   │   ├── biomarkers.py
│   │   │   ├── logs.py
│   │   │   ├── medicines.py
│   │   │   ├── chat.py
│   │   │   └── summary.py
│   │   ├── services/
│   │   │   ├── pdf_service.py        # PDF text extraction
│   │   │   └── analytics_service.py  # Forecasting, risk scores, anomalies
│   │   ├── ai/
│   │   │   ├── gemini_service.py     # Biomarker extraction + summary
│   │   │   └── rag_service.py        # Context-aware AI chatbot
│   │   └── utils/
│   │       └── auth.py               # JWT auth helpers
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/               # Dashboard, Upload, Chat, Logs, Medicines, Summary
│   │   ├── components/          # Layout, BiomarkerChart, GaugeMeter
│   │   ├── hooks/useAuth.jsx    # Auth context
│   │   └── utils/api.js         # Axios instance
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Your Gemini API key (required) |
| `GEMINI_MODEL` | Model for the AI Insights tab (default `gemini-3.6-flash`) |
| `SECRET_KEY` | JWT signing secret (change in prod!) |
| `DATABASE_URL` | PostgreSQL connection string (defaults to local SQLite if unset) |
| `UPLOAD_DIR` | Directory for PDF uploads |

---

## 🚀 Running Locally (Development)

### Prerequisites
- Python 3.11+
- Node.js 20+
- PostgreSQL running locally (Optional, defaults to SQLite)

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Download the ECG model checkpoint (about 111 MB)
python download_ecg_model.py

# Copy and configure env
cp ../.env.example ../.env
# Edit .env with your GEMINI_API_KEY and database details

# (Optional) Create PostgreSQL database if not using the default SQLite
# createdb health_db

# Generate sample PDF lab reports for testing
python generate_reports.py

# Run the server
uvicorn app.main:app --reload --port 8000
```

API docs available at: http://localhost:8000/docs

Run the backend tests:

```bash
pip install -r requirements-dev.txt
python -m pytest -q tests
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev
```

App available at: http://localhost:5173

---

## 🐳 Running with Docker

```bash
# Copy and configure env
cp .env.example .env
# Edit .env — at minimum set GEMINI_API_KEY

# Build and start all services
docker-compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

The backend Docker image downloads the ECG checkpoint from Hugging Face before
starting. For a local backend, run `python download_ecg_model.py` from `backend/`
before starting Uvicorn. The first download requires internet access; the
checkpoint is stored locally under `backend/ml_weights/` and is not committed to
GitHub. The checkpoint is provided by
[fmenegui/pretrained_image_ecg_doc](https://huggingface.co/fmenegui/pretrained_image_ecg_doc)
under CC BY 4.0.

---

## 🌟 Features

| Feature | Description |
|---|---|
| 📄 PDF Report Upload | Upload lab PDFs, extract biomarkers via Gemini 2.5 Flash |
| 📊 Biomarker Dashboard | Time-series charts with reference bands and trend arrows |
| 🔮 Forecasting | Linear regression predicts next 3 data points |
| ⚠️ Risk Scoring | 7 rule-based risk gauges: Diabetes, Cardio, Kidney, Liver, Thyroid, Anemia, Inflammation (0–100 threshold points) |
| 🚨 Anomaly Detection | Z-score based detection with alert badges |
| 💬 AI Chatbot | AI chatbot using Google Gemini |
| 🩺 Doctor Mode | Structured clinical data view for professionals |
| 💊 Medicines | Track medications with timeline overlay |
| 📝 Health Summary | AI-generated summary of all biomarker trends |
| 🫀 ECG Analysis | Analyze ECG images with the downloadable ConvNeXt-Tiny model |
| 🔐 Auth | JWT-based authentication with user isolation |
| 🗂 Dashboard tabs | **Clinical Dashboard** (Python analytics) and **AI Insights & Precision Medicine** (`/dashboard?tab=ai`) |
| ✨ AI Health Insights | Gemini insights grounded in numbered facts; each insight cites its evidence; rule-based fallback |
| 🧬 Precision Medicine | eGFR (CKD-EPI 2021), FIB-4, 10-yr ASCVD (PCE), IDRS, Asian BMI cut-offs, metabolic syndrome, CPIC pharmacogenomics, drug–lab checks, personal monitoring plan |

---

See `docs/AI_INSIGHTS_AND_PRECISION_MEDICINE.md` for how the AI tab works and `REVIEW.md` for the code review.

---

## 🔎 Ask Your Health Record — cited answers (RAG)

Answers come from a free, public reference library (openFDA drug labels, CPIC gene–drug guidelines,
MedlinePlus summaries) plus the facts the app computed from your own records. Every sentence shows numbered
sources; a validator removes sentences their sources don't support. Search uses a free local model
(BAAI/bge-small-en-v1.5) and vectors are stored in PostgreSQL with **pgvector** (numpy fallback on SQLite).
Each question makes one Gemini call (the answer); everything else runs in Python.

```bash
docker-compose exec backend python -m app.rag.ingest fetch            # download public documents
docker-compose exec backend python -m app.rag.ingest build --dry-run  # exact size + free-tier estimate
docker-compose exec backend python -m app.rag.ingest build            # embed locally + store
```
Details, licences, costs and evaluation: [docs/RAG.md](docs/RAG.md).
Where Gemini is still used and what plain Python replaced: [docs/GEMINI_USAGE.md](docs/GEMINI_USAGE.md).

## 🔒 Security Notes

- Passwords are bcrypt-hashed
- All endpoints are JWT-protected
- File uploads validated for PDF-only
- Gemini errors handled gracefully
- User data is fully isolated

---

## 🛠 Tech Stack

**Frontend:** React 18, Vite, TailwindCSS, Recharts, Axios  
**Backend:** FastAPI, SQLAlchemy, PostgreSQL, Pydantic  
**AI:** Google Gemini 2.5 Flash  
**ML:** NumPy (linear regression), Z-score anomaly detection  
**DevOps:** Docker, docker-compose, Nginx  
