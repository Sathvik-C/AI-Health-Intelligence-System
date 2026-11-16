from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean, Date, JSON, LargeBinary
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    reports = relationship("Report", back_populates="user")
    manual_logs = relationship("ManualLog", back_populates="user")
    medicines = relationship("Medicine", back_populates="user")
    diet_plans = relationship("DietPlan", back_populates="user")

    wearable_data = relationship("WearableDaily",back_populates="user",cascade="all, delete-orphan")
    consultations = relationship("Consultation", back_populates="user", cascade="all, delete-orphan")

class WearableDaily(Base):
    __tablename__ = "wearable_daily"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer,ForeignKey("users.id"),nullable=False,index=True)

    date = Column(Date, nullable=False, index=True)

    # Activity
    steps = Column(Integer, nullable=False)
    distance_km = Column(Float, nullable=False)
    active_minutes = Column(Integer, nullable=False)
    calories_burned = Column(Integer, nullable=False)

    # Sleep
    sleep_hours = Column(Float, nullable=False)
    deep_sleep_hours = Column(Float, nullable=False)
    light_sleep_hours = Column(Float, nullable=False)
    rem_sleep_hours = Column(Float, nullable=False)

    # Heart rate
    resting_heart_rate = Column(Integer, nullable=False)
    average_heart_rate = Column(Integer, nullable=False)
    max_heart_rate = Column(Integer, nullable=False)

    # Exercise
    activity_type = Column(String(50), nullable=False)
    exercise_minutes = Column(Integer, nullable=False)
    exercise_calories = Column(Integer, nullable=False)

    user = relationship("User",back_populates="wearable_data")


class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    extracted_text = Column(Text)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    report_date = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="reports")
    biomarkers = relationship("Biomarker", back_populates="report")


class Biomarker(Base):
    __tablename__ = "biomarkers"
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    value = Column(Float, nullable=False)
    unit = Column(String)
    ref_min = Column(Float, nullable=True)
    ref_max = Column(Float, nullable=True)
    recorded_at = Column(DateTime, default=datetime.utcnow)

    report = relationship("Report", back_populates="biomarkers")


class ManualLog(Base):
    __tablename__ = "manual_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    log_type = Column(String, nullable=False)  # blood_pressure, glucose, weight, pulse
    value = Column(Float, nullable=False)
    value2 = Column(Float, nullable=True)  # for systolic/diastolic
    unit = Column(String)
    notes = Column(Text, nullable=True)
    logged_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="manual_logs")


class Medicine(Base):
    __tablename__ = "medicines"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    drug_name = Column(String, nullable=False)
    dosage = Column(String)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)

    user = relationship("User", back_populates="medicines")

class DietPlan(Base):
    __tablename__ = "diet_plans"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    plan_data = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="diet_plans")


class Consultation(Base):
    __tablename__ = "consultations"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    doctor_name = Column(String, nullable=False)
    doctor_specialty = Column(String, nullable=True)
    consultation_date = Column(Date, nullable=False, default=datetime.utcnow().date)
    soap_subjective = Column(Text, nullable=True)
    soap_objective = Column(Text, nullable=True)
    soap_assessment = Column(Text, nullable=True)
    soap_plan = Column(Text, nullable=True)
    lifestyle_notes = Column(Text, nullable=True)
    follow_up_date = Column(Date, nullable=True)
    follow_up_time = Column(String, nullable=True)
    status = Column(String, default="active")  # active, completed, cancelled
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="consultations")
    prescriptions = relationship("PrescriptionChange", back_populates="consultation", cascade="all, delete-orphan", order_by="PrescriptionChange.id.asc()")
    scheduled_tests = relationship("ScheduledTest", back_populates="consultation", cascade="all, delete-orphan", order_by="ScheduledTest.due_date.asc()")


class PrescriptionChange(Base):
    __tablename__ = "prescription_changes"
    id = Column(Integer, primary_key=True, index=True)
    consultation_id = Column(Integer, ForeignKey("consultations.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    drug_name = Column(String, nullable=False)
    previous_dosage = Column(String, nullable=True)
    new_dosage = Column(String, nullable=True)
    frequency = Column(String, nullable=True)
    change_type = Column(String, nullable=False, default="added")  # added, modified, stopped, continued
    reason = Column(Text, nullable=True)
    synced_to_medicines = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    consultation = relationship("Consultation", back_populates="prescriptions")


class PatientProfile(Base):
    """Personal context used by the Precision Medicine tab (one row per user)."""
    __tablename__ = "patient_profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)

    date_of_birth = Column(Date, nullable=True)
    sex = Column(String, nullable=True)                 # male | female
    height_cm = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=True)
    waist_cm = Column(Float, nullable=True)
    ancestry = Column(String, nullable=True)            # south_asian | east_asian | african | european | hispanic | middle_eastern | other
    smoking_status = Column(String, nullable=True)      # never | former | current
    alcohol_use = Column(String, nullable=True)         # none | occasional | regular
    physical_activity = Column(String, nullable=True)   # vigorous | moderate | mild | sedentary
    parents_with_diabetes = Column(Integer, nullable=True)        # 0 | 1 | 2
    family_history_premature_ascvd = Column(Boolean, nullable=True)
    known_conditions = Column(JSON, nullable=True)      # list[str], e.g. ["type2_diabetes", "hypertension"]
    on_bp_treatment = Column(Boolean, nullable=True)    # None = infer from medicines
    pgx_results = Column(JSON, nullable=True)           # {"CYP2C19": "poor_metabolizer", "HLA-B*15:02": "positive", ...}
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AIInsightCache(Base):
    """Last generated AI insight payload per user; regenerated when the health data fingerprint changes."""
    __tablename__ = "ai_insight_cache"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    fingerprint = Column(String, nullable=False)
    source = Column(String, nullable=False)             # gemini | rule_based
    model = Column(String, nullable=True)
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ScheduledTest(Base):
    __tablename__ = "scheduled_tests"
    id = Column(Integer, primary_key=True, index=True)
    consultation_id = Column(Integer, ForeignKey("consultations.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    test_name = Column(String, nullable=False)
    due_date = Column(Date, nullable=False, index=True)
    frequency = Column(String, default="once")  # once, weekly, monthly
    instructions = Column(Text, nullable=True)
    completed = Column(Boolean, default=False, index=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    consultation = relationship("Consultation", back_populates="scheduled_tests")



class KBChunk(Base):
    """One passage of the public knowledge base (FDA labels, CPIC, MedlinePlus) used for RAG.

    `embedding` holds float32 bytes so the table works on SQLite and plain Postgres (numpy search).
    When the pgvector extension is available, app/rag/store.py adds an `embedding_vec vector(N)` column
    plus an HNSW index and searches inside Postgres instead.
    """
    __tablename__ = "kb_chunks"
    id = Column(String(255), primary_key=True)            # e.g. openfda:metformin:contraindications#0
    source = Column(String(30), nullable=False, index=True)
    doc_id = Column(String(255), nullable=False, index=True)
    title = Column(String(400), nullable=False)
    section = Column(String(200), nullable=True)
    url = Column(String(600), nullable=True)
    text = Column(Text, nullable=False)
    tags = Column(JSON, nullable=True)
    tag_index = Column(String(2000), nullable=True, index=False)   # |drug:metformin|gene:cyp2c19|
    licence = Column(String(120), nullable=True)
    version = Column(String(120), nullable=True)
    content_hash = Column(String(64), nullable=False, index=True)
    embed_model = Column(String(80), nullable=True)
    embedding = Column(LargeBinary, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
