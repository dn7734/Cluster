from docx import Document
from docx.shared import Pt
import io
import re
from datetime import datetime
from grant_scraper import evaluate_grants

def _parse_amount(text: str) -> float:
    if not text: return 0.0
    cleaned = str(text).replace(" ", "").replace("\u00a0", "")
    nums = re.findall(r"\d+", cleaned)
    return float(nums[0]) if nums else 0.0

def create_grant_document(profile_data: dict, grants_list: list = None) -> io.BytesIO:
    doc = Document()
    
    style = doc.styles['Normal']
    font = style.font
    font.name = 'Arial'
    font.size = Pt(11)

    doc.add_heading('ЕСКІЗНИЙ ПРОЄКТ (ДРАФТ) ІННОВАЦІЙНОГО АГРАРНОГО КЛАСТЕРУ', 0)
    doc.add_paragraph(
        f"Дата формування: {datetime.utcnow().strftime('%d.%m.%Y')} | "
        f"Розробник: ТОВ «Інститут інноваційної біоекономіки» & НААН\n"
        f"Об'єкт комерціалізації: Сорт гірчиці білої «Біла Принцеса»"
    )

    doc.add_heading('1. Паспорт базового учасника та економічні показники', level=1)
    fields = [
        ("Суб'єкт кластеру (ЄДРПОУ)", f"{profile_data.get('company_name', 'Не вказано')} ({profile_data.get('edrpou', '')})"),
        ("Роль у ланцюгу кластеру", profile_data.get("activity_type", "Не вказано")),
        ("Масштаб / Потужності", profile_data.get("size_category", "Не вказано")),
        ("Частка співфінансування", profile_data.get("own_contribution_percent", "30%")),
        ("Розрахункова маржа та аванс НААН", profile_data.get("employees_count", "Не розраховано")),
        ("Фокус комерціалізації", profile_data.get("investment_focus", "Трансфер ОІВ та Глибока переробка"))
    ]

    table = doc.add_table(rows=1, cols=2)
    table.style = 'Table Grid'
    hdr = table.rows[0].cells
    hdr[0].text = 'Параметр'
    hdr[1].text = 'Фактичне значення'
    for label, value in fields:
        row_cells = table.add_row().cells
        row_cells[0].text = label
        row_cells[1].text = str(value)

    doc.add_heading('2. Матриця трансформації розробки (4 технологічні етапи)', level=1)
    tech_stages = [
        ("І. Селекція (1-5 га)", "Супереліта", "ННЦ «Інститут землеробства НААН»: робота під замовлення переробника з передоплатою (30%)."),
        ("ІІ. Мультиплікація (25-50 га)", "Еліта", "ТОВ «ІІБ»: пакування в Драфт, супровід базових насіннєвих господарств."),
        ("ІІІ. Агровиробництво (300+ га)", "РС-1", "Вирощування товарного зерна та біофумігація ґрунтів за форвардним контрактом."),
        ("ІV. Глибока переробка", "Олія, порошок, шрот", "Залучення грантів переробки та венчурного капіталу (Zero-Waste модель).")
    ]
    tech_table = doc.add_table(rows=1, cols=3)
    tech_table.style = 'Table Grid'
    th = tech_table.rows[0].cells
    th[0].text = 'Етап ланцюга вартості'
    th[1].text = 'Продукт генерації'
    th[2].text = 'Механізм державно-приватного партнерства'
    for st, prod, desc in tech_stages:
        rc = tech_table.add_row().cells
        rc[0].text = st
        rc[1].text = prod
        rc[2].text = desc

    doc.add_heading('3. Рекомендовані моделі фінансування (Без боргового навантаження)', level=1)
    scored = evaluate_grants(profile_data, grants_list)
    for item in scored[:3]:
        p = doc.add_paragraph()
        p.add_run(f"Модель: {item['title']}\n").bold = True
        p.add_run(f"Провайдер/Донор: {item['donor']}\n")
        p.add_run(f"Обсяг фінансування: {item['max_amount']} (Власний внесок від {item['min_own_percent']}%)\n")
        p.add_run(f"Обґрунтування: {item['reason']}")

    doc.add_paragraph("\n*Документ згенеровано автоматично інформаційно-аналітичною платформою AgroCluster Analytics. "
                      "Готово для інтеграції з модулем AgroGrant_Bot для подачі грантової заявки.*").italic = True

    file_stream = io.BytesIO()
    doc.save(file_stream)
    file_stream.seek(0)
    return file_stream