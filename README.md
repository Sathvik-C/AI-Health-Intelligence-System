# 🏥 Health Intelligence App

A full-stack AI-powered health analytics platform with biomarker tracking, forecasting, risk scoring, and a RAG-based health chatbot.

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
│   │   │   ├── openai_service.py     # Biomarker extraction + summary
│   │   │   └── rag_service.py        # ChromaDB RAG chatbot
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
| `OPENAI_API_KEY` | Your OpenAI API key (required) |
| `SECRET_KEY` | JWT signing secret (change in prod!) |
| `DATABASE_URL` | PostgreSQL connection string |
| `UPLOAD_DIR` | Directory for PDF uploads |
| `CHROMA_PATH` | Directory for ChromaDB storage |

---

## 🚀 Running Locally (Development)

### Prerequisites
- Python 3.11+
- Node.js 20+
- PostgreSQL running locally

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and configure env
cp ../.env.example ../.env
# Edit .env with your OPENAI_API_KEY and database details

# Create PostgreSQL database
createdb health_db

# Run the server
uvicorn app.main:app --reload --port 8000
```

API docs available at: http://localhost:8000/docs

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
# Edit .env — at minimum set OPENAI_API_KEY

# Build and start all services
docker-compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

---

## 🌟 Features

| Feature | Description |
|---|---|
| 📄 PDF Report Upload | Upload lab PDFs, extract biomarkers via GPT-4o-mini |
| 📊 Biomarker Dashboard | Time-series charts with reference bands and trend arrows |
| 🔮 Forecasting | Linear regression predicts next 3 data points |
| ⚠️ Risk Scoring | Diabetes + Cardiovascular risk gauges (0–100) |
| 🚨 Anomaly Detection | Z-score based detection with alert badges |
| 💬 AI Chatbot | RAG-powered chatbot using ChromaDB + OpenAI |
| 🩺 Doctor Mode | Structured clinical data view for professionals |
| 💊 Medicines | Track medications with timeline overlay |
| 📝 Health Summary | AI-generated summary of all biomarker trends |
| 🔐 Auth | JWT-based authentication with user isolation |

---

## 🔒 Security Notes

- Passwords are bcrypt-hashed
- All endpoints are JWT-protected
- File uploads validated for PDF-only
- OpenAI errors handled gracefully
- User data is fully isolated

---

## 🛠 Tech Stack

**Frontend:** React 18, Vite, TailwindCSS, Recharts, Axios  
**Backend:** FastAPI, SQLAlchemy, PostgreSQL, Pydantic  
**AI:** OpenAI GPT-4o-mini, text-embedding-3-small, ChromaDB  
**ML:** NumPy (linear regression), Z-score anomaly detection  
**DevOps:** Docker, docker-compose, Nginx  
