"""
НАУКОВО-МЕТОДИЧНИЙ ОПИС МОДУЛЯ (main.py):
Серверне ядро інформаційно-аналітичної платформи «AgroCluster Analytics» (Версія 3.0 — Cloud Run & Firebase).
Забезпечує:
1. Подвійний контур СКБД (SQLAlchemy PostgreSQL для Cloud SQL / Neon + вбудований SQLite3 контур);
2. Двоконтурну телеметрію з авторотацією (RotatingFileHandler 1 МБ);
3. Секторальний парсер і фільтр юридичних осіб України за ЄДРПОУ (Тільки Аграрії, Переробники та НУС НААН);
4. Економіко-математичне ядро Драфту ТОВ «ІІБ» за презентацією «1_Драфт.pptx» (сорт «Біла Принцеса»);
5. Потокову генерацію DOCX-проєктів та рамкових кластерних угод.
"""

import os
import re
import uuid
import json
import sqlite3
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from pydantic import BaseModel

from llm_service import LLMService
from doc_generator import create_grant_document
from grant_scraper import DEFAULT_GRANTS, evaluate_grants
from agro_registry_service import (
    AGRO_EDRPOU_CATALOG,
    verify_and_parse_edrpou,
    search_agro_companies,
    resolve_grant_operator
)
from firebase_db_service import (
    FIREBASE_PROJECT_ID,
    FIREBASE_WEB_CONFIG,
    get_firebase_connection_status,
    sync_document_to_firestore
)

# Конфігурація логування з автоочищенням (RotatingFileHandler: ліміт 1 МБ, 2 резервні копії)
log_handler = RotatingFileHandler(
    "app.log",
    maxBytes=1 * 1024 * 1024,
    backupCount=2,
    encoding="utf-8"
)
log_formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")
log_handler.setFormatter(log_formatter)

logger = logging.getLogger("AgroClusterCore")
logger.setLevel(logging.INFO)
if not logger.handlers:
    logger.addHandler(log_handler)

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "agro2026")
SQLITE_DB_PATH = os.getenv("SQLITE_DB_PATH", os.path.join(os.path.dirname(__file__), "cluster_local.db"))


def _get_sqlite_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_storage() -> None:
    conn = _get_sqlite_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS system_logs (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                ip_address TEXT
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS edrpou_registry (
                edrpou TEXT PRIMARY KEY,
                company_name TEXT NOT NULL,
                kved TEXT NOT NULL,
                region TEXT NOT NULL,
                activity_type TEXT NOT NULL,
                cluster_role_code TEXT,
                size_category TEXT,
                employees_count TEXT,
                own_contribution_percent TEXT,
                investment_focus TEXT,
                is_budget_institution INTEGER DEFAULT 0,
                status TEXT
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS enterprise_profiles (
                user_id TEXT PRIMARY KEY,
                edrpou TEXT,
                company_name TEXT,
                kved TEXT,
                region TEXT,
                activity_type TEXT,
                size_category TEXT,
                employees_count TEXT,
                investment_focus TEXT,
                own_contribution_percent TEXT
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS grant_programs (
                code TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                donor TEXT NOT NULL,
                max_amount TEXT NOT NULL,
                min_own_percent INTEGER DEFAULT 0,
                target_kveds TEXT,
                land_req TEXT,
                keywords TEXT,
                requirements TEXT
            )
        """)

        for edrpou, comp in AGRO_EDRPOU_CATALOG.items():
            cur.execute("""
                INSERT OR REPLACE INTO edrpou_registry (
                    edrpou, company_name, kved, region, activity_type,
                    cluster_role_code, size_category, employees_count,
                    own_contribution_percent, investment_focus, is_budget_institution, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                edrpou,
                comp["company_name"],
                comp["kved"],
                comp["region"],
                comp["activity_type"],
                comp.get("cluster_role_code", "FARM_PRODUCER"),
                comp.get("size_category", ""),
                comp.get("employees_count", ""),
                comp.get("own_contribution_percent", "30%"),
                comp.get("investment_focus", ""),
                1 if comp.get("is_budget_institution") else 0,
                comp.get("status", "Верифіковано в Реєстрі ІІБ")
            ))

        for g in DEFAULT_GRANTS:
            cur.execute("""
                INSERT OR REPLACE INTO grant_programs (
                    code, title, donor, max_amount, min_own_percent,
                    target_kveds, land_req, keywords, requirements
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                g["code"],
                g["title"],
                g["donor"],
                g["max_amount"],
                g["min_own_percent"],
                g["target_kveds"],
                g["land_req"],
                ",".join(g["keywords"]) if isinstance(g["keywords"], list) else str(g["keywords"]),
                g["requirements"]
            ))

        conn.commit()
    except Exception as exc:
        logger.error("Помилка ініціалізації СКБД: %s", exc)
    finally:
        conn.close()


init_storage()


def calculate_iib_draft_economics(
    area_ha: float = 1000.0,
    yield_t_ha: float = 2.0,
    processing_pct: float = 60.0,
    prepay_pct: float = 30.0,
    price_oil_uah_t: float = 90000.0,
    price_powder_uah_t: float = 25000.0,
    price_meal_uah_t: float = 10000.0,
    price_siderat_uah_t: float = 32000.0,
    cost_grow_ha_uah: float = 14970.0,
    cost_process_t_uah: float = 21500.0
) -> dict:
    """
    Розраховує повну економіко-математичну матрицю Драфту ІІБ згідно з «1_Драфт.pptx»:
    - За кадром (Опція НУС НААН): 1 га селекційна ділянка (1,5 т вал → 1,0 т супереліти у стартап).
      Без стартапу НААН отримує лише 46 000 грн чистого ефекту; у кластері ІІБ — компенсацію супереліти,
      частку від 120 т еліти та погектарне роялті (800 грн/га базові + 200 грн/га насіннєві + 100 грн/га товарні),
      що збільшує надходження в 4,6 раза.
    - Етап І (Базове насінництво Еліти): до 200 га (виробництво кондиційної Еліти та технічної фракції).
    - Етап ІІ (Масштабування СН-1 / Товарні посіви у 50-км зоні): area_ha гектарів.
    - Етап ІІІ (Подвійне замикання):
      * Вихід А: Сидерат та фасоване насіння у мішках 25 кг (100% - processing_pct) по 42 000 грн/т;
      * Вихід Б: Глибока переробка Zero-Waste (processing_pct): порошок 50%, олія 30%, шрот 15%, насіннєва фракція 5%.
    """
    area = max(50.0, float(area_ha))
    yld = max(1.0, float(yield_t_ha))
    proc_ratio = max(0.0, min(1.0, float(processing_pct) / 100.0))
    siderat_ratio = round(1.0 - proc_ratio, 4)
    prepay_ratio = max(0.10, min(0.80, float(prepay_pct) / 100.0))

    # Масштаб насінницької бази за пропорціями 1_Драфт.pptx (норма висіву 12-20 кг/га)
    elite_ha = max(10, round(area / 15))
    super_elite_ha = max(1.0, round(elite_ha / 100, 1))
    total_harvest_tons = round(area * yld)

    # Ланка 1: Наукове ядро (ННЦ «ІЗ НААН») — Супереліта + Роялті (800 грн/га еліта + 200 грн/га насіннєві + 100 грн/га товарні)
    naan_solo_income_uah = 46000  # Слайд 11 «1_Драфт.pptx»: сума надходжень ІЗ без стартапу = 46 000 грн
    royalty_uah = round((elite_ha * 800) + (area * 0.25 * 200) + (area * 100))
    cost1 = round(super_elite_ha * 180000)
    rev1 = round((super_elite_ha * 350000) + royalty_uah + (elite_ha * 8500))
    mar1 = rev1 - cost1
    prepay_sum = round(rev1 * prepay_ratio)
    naan_Cluster_multiplier = round(max(4.6, mar1 / max(1, naan_solo_income_uah)), 1)

    # Ланка 2: Базове насінництво (ДГ / БГ — Еліта, за слайдом 6 «1_Драфт.pptx»: витрати 18,6 тис. грн/га, вихід еліти + некондиції)
    cost2 = round(elite_ha * 18600)
    rev2 = round(elite_ha * 52800)
    mar2 = rev2 - cost2

    # Ланка 3: Товарне агровиробництво та Сидерат СН-1 (слайд 8–9 «1_Драфт.pptx»)
    tons_siderat = round(total_harvest_tons * siderat_ratio)
    tons_processed = round(total_harvest_tons * proc_ratio)
    cost3 = round(area * cost_grow_ha_uah)
    # Частина врожаю реалізується як фасований сидерат/СН (мішки 25 кг), частина як товарне зерно
    rev3 = round((tons_siderat * price_siderat_uah_t) + (tons_processed * 20000))
    mar3 = rev3 - cost3

    # Ланка 4: Глибока переробка Zero-Waste (слайд 10 «1_Драфт.pptx»: Порошок 50%, Олія 30%, Шрот 15%, Насіння 5%)
    powder_tons = round(tons_processed * 0.50, 1)
    oil_tons = round(tons_processed * 0.30, 1)
    meal_tons = round(tons_processed * 0.15, 1)
    seed_fraction_tons = round(tons_processed * 0.05, 1)

    rev_oil = round(oil_tons * price_oil_uah_t)
    rev_powder = round(powder_tons * price_powder_uah_t)
    rev_meal = round(meal_tons * price_meal_uah_t)
    rev_seed_fraction = round(seed_fraction_tons * 40000.0)

    cost4 = round(tons_processed * cost_process_t_uah)
    rev4 = rev_oil + rev_powder + rev_meal + rev_seed_fraction
    mar4 = rev4 - cost4

    total_cost = cost1 + cost2 + cost3 + cost4
    total_rev = rev1 + rev2 + rev3 + rev4
    total_margin = mar1 + mar2 + mar3 + mar4
    raw_only_margin = round(naan_solo_income_uah + (total_harvest_tons * 18000 - cost3))
    roi = round((total_margin / max(1, total_cost)) * 100)
    effect_e2 = round(total_margin * 0.15)

    # Точка інвестиційного входу («Вузьке місце» для запуску Базового посіву Еліти + Контрактації ІІБ, слайди 4, 6)
    investment_entry_uah = round(cost1 + cost2 + 240000)  # Базовий посів + паушальний платіж 240 тис. грн
    investment_entry_eur = round(investment_entry_uah / 45.0)

    return {
        "area": int(area),
        "yld": round(yld, 1),
        "procPct": round(proc_ratio * 100),
        "sideratPct": round(siderat_ratio * 100),
        "prepayPct": round(prepay_ratio * 100),
        "superEliteHa": super_elite_ha,
        "eliteHa": elite_ha,
        "totalHarvestTons": total_harvest_tons,
        "tonsProcessed": tons_processed,
        "tonsSiderat": tons_siderat,
        "powderTons": powder_tons,
        "oilTons": oil_tons,
        "mealTons": meal_tons,
        "seedFractionTons": seed_fraction_tons,
        "revOil": rev_oil,
        "revPowder": rev_powder,
        "revMeal": rev_meal,
        "revSeedFraction": rev_seed_fraction,
        "cost1": cost1, "rev1": rev1, "mar1": mar1,
        "royaltyUah": royalty_uah,
        "naanSoloUah": naan_solo_income_uah,
        "naanMultiplier": naan_Cluster_multiplier,
        "prepaySum": prepay_sum,
        "cost2": cost2, "rev2": rev2, "mar2": mar2,
        "cost3": cost3, "rev3": rev3, "mar3": mar3,
        "cost4": cost4, "rev4": rev4, "mar4": mar4,
        "totalCost": total_cost,
        "totalRev": total_rev,
        "totalMargin": total_margin,
        "rawOnlyMargin": raw_only_margin,
        "roi": roi,
        "effectE2": effect_e2,
        "investmentEntryUah": investment_entry_uah,
        "investmentEntryEur": investment_entry_eur
    }


app = FastAPI(title="AgroCluster Analytics API (IIB Draft & Cluster Platform)", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

llm_service = LLMService()


class LogRequest(BaseModel):
    action: str
    details: str


class ChatRequest(BaseModel):
    message: str


class DraftCalcRequest(BaseModel):
    area: float = 1000.0
    yld: float = 2.0
    procPct: float = 60.0
    prepayPct: float = 30.0
    priceOil: float = 90000.0
    pricePowder: float = 25000.0
    priceMeal: float = 10000.0
    priceSiderat: float = 32000.0
    costGrow: float = 14970.0
    costProcess: float = 21500.0


def _record_log_db(action: str, details: str, ip_addr: str = "127.0.0.1") -> None:
    logger.info("IP: %s | ACTION: %s | DETAILS: %s", ip_addr, action, details)
    conn = _get_sqlite_conn()
    try:
        conn.execute(
            "INSERT INTO system_logs (id, timestamp, action, details, ip_address) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), datetime.utcnow().strftime("%d.%m.%Y %H:%M:%S"), action, details, ip_addr)
        )
        conn.commit()
    except Exception as exc:
        logger.error("Помилка запису логу: %s", exc)
    finally:
        conn.close()


@app.get("/")
def health_check():
    return {
        "status": "ok",
        "service": "AgroCluster Analytics Backend v3.0 (IIB Draft & Firebase/Cloud Run)",
        "architecture": "IIB Meta-Draft -> 4 Technological Capsules -> Startup Lot Slicing",
        "firebase_project": FIREBASE_PROJECT_ID,
        "firebase_web_app_id": FIREBASE_WEB_CONFIG["appId"],
        "telegram_used": False
    }


@app.get("/api/health")
def api_health():
    return health_check()


@app.get("/api/firebase-status")
def api_firebase_status():
    return get_firebase_connection_status()


@app.post("/api/draft-calc")
def compute_draft_matrix(req: DraftCalcRequest):
    return calculate_iib_draft_economics(
        area_ha=req.area,
        yield_t_ha=req.yld,
        processing_pct=req.procPct,
        prepay_pct=req.prepayPct,
        price_oil_uah_t=req.priceOil,
        price_powder_uah_t=req.pricePowder,
        price_meal_uah_t=req.priceMeal,
        price_siderat_uah_t=req.priceSiderat,
        cost_grow_ha_uah=req.costGrow,
        cost_process_t_uah=req.costProcess
    )


@app.get("/api/edrpou")
def list_or_search_agro_edrpou(
    q: str = Query("", description="Пошук за кодом ЄДРПОУ, назвою або КВЕД"),
    role: str = Query("", description="Фільтр за роллю у кластері (SCIENCE_CORE, IIB_PROVIDER, SEED_ELITE, FARM_PRODUCER, DEEP_PROCESSOR)")
):
    items = search_agro_companies(query=q, role_filter=role)
    return {
        "total": len(items),
        "sector_filter": "ONLY_AGRARIAN_AND_BIOECONOMY",
        "items": items
    }


@app.get("/api/edrpou/{code}")
def verify_edrpou_endpoint(
    code: str,
    context: str = Query("", description="Додатковий опис або КВЕД підприємства"),
    request: Request = None
):
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    result = verify_and_parse_edrpou(code, context_text=context)

    if not result.get("ok"):
        _record_log_db("EDRPOU_REJECTED_NON_AGRO", f"ЄДРПОУ {code}: {result.get('message')}", client_ip)
        return JSONResponse(status_code=422, content=result)

    conn = _get_sqlite_conn()
    try:
        conn.execute("""
            INSERT OR REPLACE INTO edrpou_registry (
                edrpou, company_name, kved, region, activity_type,
                cluster_role_code, size_category, employees_count,
                own_contribution_percent, investment_focus, is_budget_institution, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            result["edrpou"],
            result["company_name"],
            result["kved"],
            result["region"],
            result["activity_type"],
            result.get("cluster_role_code", "FARM_PRODUCER"),
            result.get("size_category", "300 га"),
            result.get("employees_count", ""),
            result.get("own_contribution_percent", "30%"),
            result.get("investment_focus", ""),
            1 if result.get("is_budget_institution") else 0,
            result.get("status", "Верифіковано Агро-Фільтром")
        ))
        conn.commit()
    finally:
        conn.close()

    _record_log_db("EDRPOU_AGRO_VERIFIED", f"ЄДРПОУ {result['edrpou']}: {result['company_name']} ({result['kved']})", client_ip)
    return result


@app.post("/log")
async def record_telemetry_log(req: LogRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    _record_log_db(req.action, req.details, client_ip)
    return {"status": "logged"}


@app.get("/api/logs")
def get_system_logs(password: str = Query("")):
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Невірний пароль адміністратора")
    conn = _get_sqlite_conn()
    try:
        rows = conn.execute("SELECT timestamp, action, details, ip_address FROM system_logs ORDER BY rowid DESC LIMIT 60").fetchall()
        return {
            "logs": [
                {
                    "timestamp": r["timestamp"],
                    "action": r["action"],
                    "details": f"{r['details']} [IP: {r['ip_address']}]"
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


@app.get("/api/stats")
def get_admin_stats(password: str = Query("")):
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Невірний пароль адміністратора")
    conn = _get_sqlite_conn()
    try:
        registry = conn.execute("SELECT region, activity_type FROM edrpou_registry").fetchall()
        grants_cnt = conn.execute("SELECT COUNT(*) as c FROM grant_programs").fetchone()["c"]
        regions, activities = {}, {}
        for p in registry:
            reg = p["region"].split(",")[0].strip() if p["region"] else "Не вказано"
            act = p["activity_type"].split(":")[0].strip() if p["activity_type"] else "Не вказано"
            regions[reg] = regions.get(reg, 0) + 1
            activities[act] = activities.get(act, 0) + 1
        return {
            "total": len(registry),
            "edrpou_verified": len(registry),
            "grants_count": grants_cnt,
            "avg_own_percent": 30,
            "regions": regions,
            "activities": activities
        }
    finally:
        conn.close()


@app.get("/grants/sync")
async def sync_grants():
    init_storage()
    logger.info("Виконано синхронізацію каталогу моделей НААН-ІІБ")
    return {"status": "synced", "count": len(DEFAULT_GRANTS)}


@app.post("/chat/{user_id}")
async def chat_with_coordinator(user_id: uuid.UUID, request: ChatRequest, req_meta: Request):
    client_ip = req_meta.client.host if req_meta.client else "unknown"
    uid_str = str(user_id)

    edrpou_match = re.search(r"\b(\d{8})\b", request.message)
    if edrpou_match:
        found_code = edrpou_match.group(1)
        verified = verify_and_parse_edrpou(found_code, context_text=request.message)
        if not verified.get("ok"):
            _record_log_db("CHAT_NON_AGRO_REJECTED", f"ЄДРПОУ {found_code}: {verified.get('message')}", client_ip)
            return {
                "reply": verified.get("message"),
                "profile": None,
                "grants": [],
                "is_error": True,
                "error_code": verified.get("error_code", "NON_AGRO_REJECTED")
            }
        current_profile = verified
    else:
        current_profile = dict(AGRO_EDRPOU_CATALOG["00496802"])
        current_profile["grant_operator"] = resolve_grant_operator(current_profile)

    llm_response = await llm_service.generate_response(request.message, current_profile)
    extracted = llm_response.get("extracted_data", {})
    for k, v in extracted.items():
        if v and k in current_profile:
            current_profile[k] = str(v)

    current_profile["grant_operator"] = resolve_grant_operator(current_profile)
    scored = evaluate_grants(current_profile, DEFAULT_GRANTS)

    return {
        "reply": llm_response.get("reply", "Параметри учасника кластеру оновлено в матриці Драфту ІІБ."),
        "profile": current_profile,
        "grants": scored,
        "is_error": False
    }


@app.api_route("/export/{user_id}", methods=["GET", "HEAD"])
def export_cluster_docx(
    user_id: str,
    request: Request,
    edrpou: str = Query("00496802"),
    company: str = Query("ННЦ «ІНСТИТУТ ЗЕМЛЕРОБСТВА НААН»"),
    kved: str = Query("72.19 Дослідження й експериментальні розробки"),
    area: str = Query("1000"),
    margin: str = Query("21.03 млн грн"),
    roi: str = Query("118"),
    prepay: str = Query("713 тис. грн")
):
    client_ip = request.client.host if request.client else "unknown"
    _record_log_db("DOCX_SERVER_EXPORT", f"EDRPOU: {edrpou}, Area: {area}ha, Margin: {margin}, ROI: {roi}%", client_ip)

    verified = verify_and_parse_edrpou(edrpou, context_text=f"{company} {kved}")
    base_prof = verified if verified.get("ok") else {
        "edrpou": edrpou,
        "company_name": company,
        "kved": kved,
        "activity_type": "Учасник інноваційного аграрного кластеру «Біла Принцеса»"
    }

    profile_data = {
        "edrpou": base_prof.get("edrpou", edrpou),
        "company_name": base_prof.get("company_name", company),
        "kved": base_prof.get("kved", kved),
        "activity_type": base_prof.get("activity_type", "Учасник інноваційного аграрного кластеру «Біла Принцеса»"),
        "size_category": f"{area} га товарних посівів у 50-км кластерній зоні",
        "own_contribution_percent": base_prof.get("own_contribution_percent", "30%"),
        "employees_count": f"Чиста маржа кластеру: {margin} (ROI {roi}%) | Роялті та аванс НААН: {prepay}",
        "investment_focus": "Драфт ІІБ: 1 га Супереліта НААН → 200 га Базова Еліта → СН-1 → Сидерат + Глибока переробка"
    }
    doc_stream = create_grant_document(profile_data, DEFAULT_GRANTS)
    return StreamingResponse(
        doc_stream,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=AgroCluster_IIB_Draft_Agreement.docx"}
    )


# Роздача статичних файлів фронтенду при деплої єдиним контейнером на Cloud Run
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


@app.get("/index.html")
def serve_index():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))


@app.get("/admin.html")
def serve_admin():
    return FileResponse(os.path.join(BASE_DIR, "admin.html"))


@app.get("/style.css")
def serve_css():
    return FileResponse(os.path.join(BASE_DIR, "style.css"), media_type="text/css")


@app.get("/script.js")
def serve_js():
    return FileResponse(os.path.join(BASE_DIR, "script.js"), media_type="application/javascript")
