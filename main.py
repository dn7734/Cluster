import os
import uuid
import logging
from datetime import datetime
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, ForeignKey, String, Text, create_engine
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from doc_generator import create_grant_document

# НАЛАШТУВАННЯ ЛОГУВАННЯ У ФАЙЛ (Системний дебаг)
logging.basicConfig(
    filename='app.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(client_ip)s - %(message)s'
)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./cluster.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# НАЛАШТУВАННЯ ЛОГУВАННЯ У БАЗУ ДАНИХ (Для адмінки)
class SystemLog(Base):
    __tablename__ = "system_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp = Column(DateTime, default=datetime.utcnow)
    action = Column(String, nullable=False)
    details = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)

class EnterpriseProfile(Base):
    __tablename__ = "enterprise_profiles"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    edrpou = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    activity_type = Column(String, nullable=True)

Base.metadata.create_all(bind=engine)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class LogRequest(BaseModel):
    action: str
    details: str

@app.post("/log")
async def log_action(req: LogRequest, request: Request):
    """Ендпоінт для запису дій користувача з фронтенду"""
    client_ip = request.client.host if request.client else "unknown"
    
    # 1. Логування у файл
    d = {'client_ip': client_ip}
    logger.info(f"ACTION: {req.action} | DETAILS: {req.details}", extra=d)
    
    # 2. Логування у БД
    db = SessionLocal()
    try:
        new_log = SystemLog(action=req.action, details=req.details, ip_address=client_ip)
        db.add(new_log)
        db.commit()
    except Exception as e:
        logger.error(f"DB Log Error: {str(e)}", extra=d)
    finally:
        db.close()
    return {"status": "logged"}

@app.api_route("/export/{user_id}", methods=["GET", "HEAD"])
def export_grant(user_id: str, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    logger.info("Generated DOCX Export", extra={'client_ip': client_ip})
    
    db = SessionLocal()
    try:
        # Логуємо генерацію документа у БД
        db.add(SystemLog(action="DOCX_GENERATION", details="Generated full scientific plan DOCX", ip_address=client_ip))
        db.commit()
        
        profile_data = {
            "edrpou": "00496802",
            "company_name": "ННЦ «ІНСТИТУТ ЗЕМЛЕРОБСТВА НААН»",
            "activity_type": "Наукове ядро кластеру",
            "size_category": "300 га",
            "own_contribution_percent": "30%"
        }
        grants_list = [{"title": "Венчурний стартап ІІБ", "donor": "ІІБ", "max_amount": "6.5 млн грн", "min_own_percent": 25, "reason": "Передоплата селекції"}]
        doc_stream = create_grant_document(profile_data, grants_list)
        return StreamingResponse(
            doc_stream,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=AgroCluster_Scientific_Plan.docx"}
        )
    finally:
        db.close()