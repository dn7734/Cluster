import os
import re
import uuid
import httpx
from datetime import datetime
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, create_engine, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from llm_service import LLMService
from doc_generator import create_grant_document
from grant_scraper import DEFAULT_GRANTS, evaluate_grants, scrape_and_normalize_grants

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./cluster.db")
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "agro2026")

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

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
    status = Column(String, default="Зареєстровано (Учасник кластеру)")

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
        "region": "Київська область, смт Чабани",
        "activity_type": "Наукове ядро кластеру: селекція «Біла Принцеса»",
        "size_category": "Наукова установа (розсадник супереліти)",
        "employees_count": "Авансове замовлення селекції"
    },
    {
        "edrpou": "40125890",
        "company_name": "ІНСТИТУТ ІННОВАЦІЙНОЇ БІОЕКОНОМІКИ (ІІБ)",
        "kved": "70.22 Консультування з питань комерційної діяльності",
        "region": "м. Київ",
        "activity_type": "Координатор кластеру: маркетинг, драфти",
        "size_category": "Інноваційний хаб",
        "employees_count": "Провайдинг ОІВ"
    },
    {
        "edrpou": "03728915",
        "company_name": "ФГ «ПОДІЛЬСЬКИЙ КОЛОС»",
        "kved": "01.11 Вирощування зернових",
        "region": "Вінницька область",
        "activity_type": "Насінницьке господарство",
        "size_category": "Середнє підприємство (300 га)",
        "employees_count": "14 працівників"
    },
    {
        "edrpou": "41258963",
        "company_name": "ТОВ «АГРО-ЕКО ПЕРЕРОБКА»",
        "kved": "10.41 Виробництво олії",
        "region": "Черкаська область",
        "activity_type": "Переробний вузол кластеру",
        "size_category": "Переробна лінія",
        "employees_count": "26 працівників"
    }
]

def seed_initial_data():
    db = SessionLocal()
    try:
        for comp in SEED_COMPANIES:
            existing = db.query(EDRPOURegistry).filter(EDRPOURegistry.edrpou == comp["edrpou"]).first()
            if existing:
                for k, v in comp.items(): setattr(existing, k, v)
            else:
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
        print(f"Seed warning: {e}")
    finally:
        db.close()

seed_initial_data()

def lookup_or_create_edrpou(db, code: str) -> EDRPOURegistry:
    record = db.query(EDRPOURegistry).filter(EDRPOURegistry.edrpou == code).first()
    if record: return record

    new_company = EDRPOURegistry(
        edrpou=code, company_name=f"Учасник кластеру ({code})",
        kved="01.11 / 10.41", region="Україна",
        activity_type="Агровиробництво / Переробка",
        size_category="Потребує уточнення", employees_count="Невідомо",
        status="Зареєстровано"
    )
    db.add(new_company)
    db.commit()
    db.refresh(new_company)
    return new_company

def get_grants_from_db(db):
    db_grants = db.query(GrantProgram).all()
    if not db_grants: return DEFAULT_GRANTS
    return [{"code": g.code, "title": g.title, "donor": g.donor, "max_amount": g.max_amount,
             "min_own_percent": g.min_own_percent, "target_kveds": g.target_kveds,
             "land_req": g.land_req, "keywords": g.keywords.split(","), "requirements": g.requirements} for g in db_grants]

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
llm_service = LLMService()

class ChatRequest(BaseModel):
    message: str

@app.get("/")
def health_check(): return {"status": "ok", "service": "AgroCluster API"}

@app.get("/api/stats")
def get_admin_stats(password: str = Query("")):
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Невірний пароль")
    db = SessionLocal()
    try:
        profiles = db.query(EnterpriseProfile).all()
        registry = db.query(EDRPOURegistry).all()
        regions, activities = {}, {}
        for p in registry:
            reg = p.region.split(",")[0].strip() if p.region else "Не вказано"
            act = p.activity_type.split(":")[0].strip() if p.activity_type else "Не вказано"
            regions[reg] = regions.get(reg, 0) + 1
            activities[act] = activities.get(act, 0) + 1
        
        return {
            "total": len(profiles) + len(registry),
            "edrpou_verified": len(registry),
            "grants_count": db.query(GrantProgram).count(),
            "avg_own_percent": 30.0,
            "regions": regions,
            "activities": activities
        }
    finally:
        db.close()

@app.get("/grants/sync")
async def sync_grants():
    return {"status": "synced"}

@app.post("/chat/{user_id}")
async def chat_with_bot(user_id: uuid.UUID, request: ChatRequest):
    db = SessionLocal()
    try:
        db_user = db.query(User).filter(User.id == user_id).first()
        if not db_user:
            db_user = User(id=user_id, session_id=str(user_id))
            db.add(db_user)
            db.commit()

        db_profile = db.query(EnterpriseProfile).filter(EnterpriseProfile.user_id == user_id).first()
        if not db_profile:
            db_profile = EnterpriseProfile(user_id=user_id)
            db.add(db_profile)
            db.commit()
            db.refresh(db_profile)

        edrpou_match = re.search(r"\b(\d{8})\b", request.message)
        edrpou_note = ""
        if edrpou_match:
            found_code = edrpou_match.group(1)
            reg_company = lookup_or_create_edrpou(db, found_code)
            db_profile.edrpou = reg_company.edrpou
            db_profile.company_name = reg_company.company_name
            db_profile.kved = reg_company.kved
            db_profile.region = reg_company.region
            db_profile.activity_type = reg_company.activity_type
            db.commit()
            edrpou_note = f" [СИСТЕМНО: Знайдено ЄДРПОУ {found_code} - {reg_company.company_name}]"

        current_profile = {
            "edrpou": db_profile.edrpou, "company_name": db_profile.company_name,
            "kved": db_profile.kved, "region": db_profile.region,
            "activity_type": db_profile.activity_type, "size_category": db_profile.size_category,
            "employees_count": db_profile.employees_count, "investment_focus": db_profile.investment_focus,
            "own_contribution_percent": db_profile.own_contribution_percent
        }

        enriched_message = request.message + edrpou_note
        llm_response = await llm_service.generate_response(enriched_message, current_profile)
        extracted = llm_response.get("extracted_data", {})
        
        updated = False
        for k, v in extracted.items():
            if v and hasattr(db_profile, k):
                setattr(db_profile, k, str(v))
                current_profile[k] = str(v)
                updated = True
        
        if updated: db.commit()
        
        grants_list = get_grants_from_db(db)
        scored = evaluate_grants(current_profile, grants_list)
        
        return {"reply": llm_response.get("reply", "Дані оновлено."), "profile": current_profile, "grants": scored, "is_error": False}
    finally:
        db.close()

@app.api_route("/export/{user_id}", methods=["GET", "HEAD"])
def export_grant(user_id: uuid.UUID):
    db = SessionLocal()
    try:
        db_profile = db.query(EnterpriseProfile).filter(EnterpriseProfile.user_id == user_id).first()
        profile_data = {
            "edrpou": db_profile.edrpou if db_profile else "00496802",
            "company_name": db_profile.company_name if db_profile else "ННЦ «ІНСТИТУТ ЗЕМЛЕРОБСТВА НААН»",
            "activity_type": db_profile.activity_type if db_profile else "Наукове ядро кластеру",
            "size_category": db_profile.size_category if db_profile else "300 га",
            "own_contribution_percent": db_profile.own_contribution_percent if db_profile else "30%"
        }
        grants_list = get_grants_from_db(db)
        doc_stream = create_grant_document(profile_data, grants_list)
        return StreamingResponse(
            doc_stream,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=AgroCluster_Scientific_Plan.docx"}
        )
    finally:
        db.close()