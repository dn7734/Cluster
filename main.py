"""
Модуль серверного ядра інформаційно-аналітичної платформи AgroCluster Analytics.
Реалізує архітектуру REST API (FastAPI), ORM-рівень збереження даних (SQLAlchemy)
та двоконтурну систему телеметрії (файловий журнал app.log + реляційна таблиця system_logs).
"""

import os
import re
import uuid
import logging
from datetime import datetime
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from llm_service import LLMService
from doc_generator import create_grant_document
from grant_scraper import DEFAULT_GRANTS, evaluate_grants

# Ініціалізація першого контуру логування: системний файловий журнал app.log
logging.basicConfig(
    filename="app.log",
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("AgroClusterLogger")

# Нормалізація рядка підключення до СКБД PostgreSQL (Neon) або локальної SQLite
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./cluster.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
elif DATABASE_URL.startswith("postgresql://") and "+psycopg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "agro2026")

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class SystemLog(Base):
    """Другий контур логування: реляційна таблиця для збереження аудиту подій."""
    __tablename__ = "system_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp = Column(DateTime, default=datetime.utcnow)
    action = Column(String, nullable=False)
    details = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)


class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    profile = relationship("EnterpriseProfile", back_populates="user", uselist=False)


class EnterpriseProfile(Base):
    __tablename__ = "enterprise_profiles"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True)
    edrpou = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    kved = Column(String, nullable=True)
    region = Column(String, nullable=True)
    activity_type = Column(String, nullable=True)
    size_category = Column(String, nullable=True)
    employees_count = Column(String, nullable=True)
    investment_focus = Column(String, nullable=True)
    own_contribution_percent = Column(String, nullable=True)
    user = relationship("User", back_populates="profile")


class EDRPOURegistry(Base):
    __tablename__ = "edrpou_registry"
    edrpou = Column(String, primary_key=True, index=True)
    company_name = Column(String, nullable=False)
    kved = Column(String, nullable=False)
    region = Column(String, nullable=False)
    activity_type = Column(String, nullable=False)
    size_category = Column(String, nullable=False)
    employees_count = Column(String, nullable=False)
    status = Column(String, default="Верифіковано в кластері")


class GrantProgram(Base):
    __tablename__ = "grant_programs"
    code = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    donor = Column(String, nullable=False)
    max_amount = Column(String, nullable=False)
    min_own_percent = Column(Integer, default=0)
    target_kveds = Column(String, nullable=True)
    land_req = Column(String, nullable=True)
    keywords = Column(String, nullable=True)
    requirements = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(bind=engine)

SEED_COMPANIES = [
    {
        "edrpou": "00496802",
        "company_name": "ННЦ «ІНСТИТУТ ЗЕМЛЕРОБСТВА НААН»",
        "kved": "72.19 Дослідження й експериментальні розробки",
        "region": "Київська обл., смт Чабани",
        "activity_type": "Наукове ядро: Супереліта",
        "size_category": "Розсадник 1–15 га",
        "employees_count": "Роялті + Аванс 30%"
    },
    {
        "edrpou": "40125890",
        "company_name": "ТОВ «ІНСТИТУТ ІННОВАЦІЙНОЇ БІОЕКОНОМІКИ» (ІІБ)",
        "kved": "70.22 Консультування з питань комерційної діяльності",
        "region": "м. Київ",
        "activity_type": "Координація (ІІБ): Драфт і Тизер",
        "size_category": "Інноваційний хаб",
        "employees_count": "Провайдинг ОІВ"
    },
    {
        "edrpou": "03728915",
        "company_name": "ФГ «ПОДІЛЬСЬКИЙ КОЛОС»",
        "kved": "01.11 Вирощування зернових і технічних культур",
        "region": "Вінницька обл.",
        "activity_type": "Насінництво: Еліта та РС-1",
        "size_category": "300 га",
        "employees_count": "Маржа агровиробництва"
    },
    {
        "edrpou": "41258963",
        "company_name": "ТОВ «АГРО-ЕКО ПЕРЕРОБКА»",
        "kved": "10.41 Виробництво олії та тваринних жирів",
        "region": "Черкаська обл.",
        "activity_type": "Глибока переробка: Олія та шрот",
        "size_category": "Лінія до 1500 т/рік",
        "employees_count": "Zero-Waste цикл"
    }
]


def seed_initial_data():
    db = SessionLocal()
    try:
        for comp in SEED_COMPANIES:
            existing = db.query(EDRPOURegistry).filter(EDRPOURegistry.edrpou == comp["edrpou"]).first()
            if not existing:
                db.add(EDRPOURegistry(**comp))
        for g in DEFAULT_GRANTS:
            exists_g = db.query(GrantProgram).filter(GrantProgram.code == g["code"]).first()
            if not exists_g:
                db.add(GrantProgram(
                    code=g["code"], title=g["title"], donor=g["donor"], max_amount=g["max_amount"],
                    min_own_percent=g["min_own_percent"], target_kveds=g["target_kveds"],
                    land_req=g["land_req"], keywords=",".join(g["keywords"]), requirements=g["requirements"]
                ))
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Помилка ініціалізації базових довідників: {e}")
    finally:
        db.close()


seed_initial_data()

app = FastAPI(title="AgroCluster Analytics API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
llm_service = LLMService()


class LogRequest(BaseModel):
    action: str
    details: str


class ChatRequest(BaseModel):
    message: str


@app.get("/")
def health_check():
    return {"status": "ok", "service": "AgroCluster Backend API"}


@app.post("/log")
async def record_telemetry_log(req: LogRequest, request: Request):
    """Запис події одночасно у файловий лог та таблицю СКБД."""
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"IP: {client_ip} | ACTION: {req.action} | DETAILS: {req.details}")
    db = SessionLocal()
    try:
        db.add(SystemLog(action=req.action, details=req.details, ip_address=client_ip))
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"DB Log error: {e}")
    finally:
        db.close()
    return {"status": "logged"}


@app.get("/api/logs")
def get_system_logs(password: str = Query("")):
    """Вивантаження останніх 50 записів телеметрії для адміністративної панелі."""
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Невірний пароль")
    db = SessionLocal()
    try:
        rows = db.query(SystemLog).order_by(SystemLog.timestamp.desc()).limit(50).all()
        return {
            "logs": [
                {
                    "timestamp": r.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "action": r.action,
                    "details": f"{r.details} (IP: {r.ip_address})"
                }
                for r in rows
            ]
        }
    finally:
        db.close()


@app.get("/api/stats")
def get_admin_stats(password: str = Query("")):
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Невірний пароль")
    db = SessionLocal()
    try:
        registry = db.query(EDRPOURegistry).all()
        regions, activities = {}, {}
        for p in registry:
            reg = p.region.split(",")[0].strip() if p.region else "Не вказано"
            act = p.activity_type.split(":")[0].strip() if p.activity_type else "Не вказано"
            regions[reg] = regions.get(reg, 0) + 1
            activities[act] = activities.get(act, 0) + 1
        return {
            "total": len(registry),
            "edrpou_verified": len(registry),
            "grants_count": db.query(GrantProgram).count(),
            "avg_own_percent": 30,
            "regions": regions,
            "activities": activities
        }
    finally:
        db.close()


@app.api_route("/export/{user_id}", methods=["GET", "HEAD"])
def export_grant(
    user_id: str,
    request: Request,
    edrpou: str = Query("00496802"),
    company: str = Query("ННЦ «ІНСТИТУТ ЗЕМЛЕРОБСТВА НААН»"),
    area: str = Query("300"),
    margin: str = Query("19.87 млн грн"),
    roi: str = Query("118"),
    prepay: str = Query("713 тис. грн")
):
    """Формування DOCX-проєкту з урахуванням параметрів, переданих із калькулятора."""
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"IP: {client_ip} | DOCX_EXPORT | EDRPOU: {edrpou} | Area: {area}ha")
    db = SessionLocal()
    try:
        db.add(SystemLog(action="DOCX_SERVER_EXPORT", details=f"EDRPOU: {edrpou}, Area: {area}ha, Margin: {margin}", ip_address=client_ip))
        db.commit()
        profile_data = {
            "edrpou": edrpou,
            "company_name": company,
            "activity_type": "Учасник інноваційного кластеру «Біла Принцеса»",
            "size_category": f"{area} га у кластерному циклі",
            "own_contribution_percent": "30%",
            "employees_count": f"Маржа: {margin} (ROI {roi}%) | Аванс НААН: {prepay}",
            "investment_focus": "Трансфер селекції НААН → Насінництво → Глибока переробка (Олія, порошок, шрот)"
        }
        doc_stream = create_grant_document(profile_data, DEFAULT_GRANTS)
        return StreamingResponse(
            doc_stream,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=AgroCluster_Scientific_Plan.docx"}
        )
    finally:
        db.close()