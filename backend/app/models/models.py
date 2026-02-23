from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean, Date
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
