import os
import uuid
import httpx
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, create_engine, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from llm_service import LLMService
from doc_generator import create_grant_document

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./cluster.db")
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(String, unique=True, nullable=False)
    profile = relationship("EnterpriseProfile", back_populates="user", uselist=False)

class EnterpriseProfile(Base):
    __tablename__ = "enterprise_profiles"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True)
    edrpou = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    activity_type = Column(String, nullable=True)
    size_category = Column(String, nullable=True)
    own_contribution_percent = Column(String, nullable=True)
    user = relationship("User", back_populates="profile")

Base.metadata.create_all(bind=engine)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

llm_service = LLMService()

class ChatRequest(BaseModel):
    message: str

@app.get("/")
def health_check():
    return {"status": "ok", "service": "AgroCluster Backend"}

@app.post("/chat/{user_id}")
async def chat_with_bot(user_id: uuid.UUID, request: ChatRequest):
    # Скорочений ендпоінт чату для демонстрації
    return {"reply": "Дані отримано та оновлено в системі.", "profile": {}, "is_error": False}

@app.api_route("/export/{user_id}", methods=["GET", "HEAD"])
def export_grant(user_id: uuid.UUID):
    db = SessionLocal()
    try:
        # Для демо-версії генеруємо документ із базовим профілем
        profile_data = {
            "edrpou": "00496802",
            "company_name": "ННЦ «ІНСТИТУТ ЗЕМЛЕРОБСТВА НААН»",
            "activity_type": "Наукове ядро кластеру: Супереліта",
            "size_category": "300 га (кластерний цикл)",
            "own_contribution_percent": "30%"
        }
        grants_list = [
            {"title": "Венчурний стартап ІІБ", "donor": "ІІБ", "max_amount": "6.5 млн грн", "min_own_percent": 25, "reason": "Передоплата селекції"},
            {"title": "Грант Мінекономіки", "donor": "Держава", "max_amount": "8.0 млн грн", "min_own_percent": 20, "reason": "Глибока переробка"}
        ]
        doc_stream = create_grant_document(profile_data, grants_list)
        return StreamingResponse(
            doc_stream,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=AgroCluster_Scientific_Plan.docx"}
        )
    finally:
        db.close()