"""
Модуль генерації проєкту інноваційного кластеру у форматі DOCX (AgroCluster Analytics).
"""

import io
from datetime import datetime
from docx import Document
from docx.shared import Pt
from grant_scraper import evaluate_grants


def create_grant_document(profile_data: dict, grants_list: list = None) -> io.BytesIO:
    doc = Document()
    normal_style = doc.styles["Normal"]
    normal_style.font.name = "Arial"
    normal_style.font.size = Pt(11)

    doc.add_heading("ЕСКІЗНИЙ ПРОЄКТ (ДРАФТ) ІННОВАЦІЙНОГО АГРАРНОГО КЛАСТЕРУ", 0)
    doc.add_paragraph(
        f"Дата формування: {datetime.utcnow().strftime('%d.%m.%Y')} | "
        f"Методологічний провайдер: ТОВ «Інститут інноваційної біоекономіки» (ІІБ) & НААН України
"
        f"Об'єкт трансферу інновацій (ОІВ): Сорт гірчиці білої «Біла Принцеса»"
    )

    doc.add_heading("1. Паспорт учасника кластеру та розрахункові показники маржинальності", level=1)
    fields = [
        ("Суб'єкт кластеру (Код ЄДРПОУ)", f"{profile_data.get('company_name', 'Не вказано')} ({profile_data.get('edrpou', '00496802')})"),
        ("Роль у ланцюгу доданої вартості", profile_data.get("activity_type", "Учасник кластерного циклу")),
        ("Масштаб виробництва у кластері", profile_data.get("size_category", "300 га")),
        ("Частка власного співфінансування / ОІВ", profile_data.get("own_contribution_percent", "30%")),
        ("Розрахункова чиста маржа та аванс НААН", profile_data.get("employees_count", "Визначено за моделлю E2")),
        ("Стратегічний фокус комерціалізації", profile_data.get("investment_focus", "Трансфер ОІВ та глибока переробка"))
    ]

    table = doc.add_table(rows=1, cols=2)
    table.style = "Table Grid"
    table.rows[0].cells[0].text = "Параметр паспорта кластеру"
    table.rows[0].cells[1].text = "Верифіковане значення"
    for label, value in fields:
        rc = table.add_row().cells
        rc[0].text = label
        rc[1].text = str(value)

    doc.add_heading("2. Організаційно-економічний механізм масштабування (4 ланки кластеру)", level=1)
    tech_stages = [
        ("Етап І. Наукове ядро (1–5 га)", "Супереліта", "ННЦ «Інститут землеробства НААН»: селекція під замовлення з передоплатою 30%."),
        ("Етап ІІ. Мультиплікація (25–50 га)", "Еліта та Драфт", "ТОВ «ІІБ»: пакування драфту та тизера, авторський нагляд за насінництвом."),
        ("Етап ІІІ. Агровиробництво (300+ га)", "РС-1 (Товарне зерно)", "Вирощування гірчиці за форвардними Off-take контрактами та сидерація."),
        ("Етап ІV. Глибока переробка", "Олія, порошок, шрот", "Безвідходна технологія Zero-Waste (+135% доданої вартості).")
    ]
    t2 = doc.add_table(rows=1, cols=3)
    t2.style = "Table Grid"
    t2.rows[0].cells[0].text = "Ланка кластеру"
    t2.rows[0].cells[1].text = "Продукт"
    t2.rows[0].cells[2].text = "Механізм ДПП"
    for st, prod, desc in tech_stages:
        rc = t2.add_row().cells
        rc[0].text = st
        rc[1].text = prod
        rc[2].text = desc

    doc.add_heading("3. Рекомендовані безкредитні моделі фінансування", level=1)
    for item in evaluate_grants(profile_data, grants_list)[:3]:
        p = doc.add_paragraph()
        p.add_run(f"• {item['title']} (Індекс відповідності: {item['score']}%)
").bold = True
        p.add_run(f"Донор: {item['donor']} | Обсяг: {item['max_amount']} | Внесок: від {item['min_own_percent']}%
")
        p.add_run(f"Обґрунтування: {item['reason']}")

    stream = io.BytesIO()
    doc.save(stream)
    stream.seek(0)
    return stream
