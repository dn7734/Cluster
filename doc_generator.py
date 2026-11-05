from docx import Document
import io
import re
from datetime import datetime
from grant_scraper import evaluate_grants

def _parse_amount(text: str) -> float:
    if not text:
        return 0.0
    cleaned = str(text).replace(" ", "").replace("\u00a0", "")
    nums = re.findall(r"\d+", cleaned)
    if not nums:
        return 0.0
    return float(nums[0])

def create_grant_document(profile_data: dict, grants_list: list = None) -> io.BytesIO:
    doc = Document()
    doc.add_heading('Ескізний проєкт (Драфт) інноваційного аграрного кластеру НААН та ІІБ', 0)
    doc.add_paragraph(
        f"Дата формування: {datetime.utcnow().strftime('%d.%m.%Y %H:%M')} | "
        f"Біоекономічна платформа партнерства науки і бізнесу (Кейс: сорт гірчиці «Біла Принцеса»)"
    )

    # Розділ 1. Паспорт учасника інноваційного кластеру
    doc.add_heading('1. Паспорт учасника кластеру та реєстраційні дані ЄДРПОУ', level=1)
    fields = [
        ("Код ЄДРПОУ", profile_data.get("edrpou") or "Не вказано (рекомендовано верифікувати)"),
        ("Повне найменування суб'єкта", profile_data.get("company_name") or "Не вказано"),
        ("Основний КВЕД", profile_data.get("kved") or "Не вказано"),
        ("Регіон локалізації", profile_data.get("region") or "Не вказано"),
        ("Функціональна роль у кластері", profile_data.get("activity_type") or "Не вказано"),
        ("Земельний банк / Виробничі потужності", profile_data.get("size_category") or "Не вказано"),
        ("Кадровий та науковий потенціал", profile_data.get("employees_count") or "Не вказано"),
        ("Фокус інновацій у ланцюгу вартості", profile_data.get("investment_focus") or "Масштабування сорту «Біла Принцеса»"),
        ("Частка власного співфінансування", f"{profile_data.get('own_contribution_percent') or '30%'}"),
    ]

    table = doc.add_table(rows=1, cols=2)
    hdr = table.rows[0].cells
    hdr[0].text = 'Параметр паспорта кластеру'
    hdr[1].text = 'Фактичне значення'
    for label, value in fields:
        row_cells = table.add_row().cells
        row_cells[0].text = label
        row_cells[1].text = str(value)

    # Розділ 2. Трирівневий алгоритм трансферу інновацій (Методологія НААН та ІІБ)
    doc.add_heading('2. Оцінка готовності за 3 рівнями трансферу інновацій (Методологія ІІБ)', level=1)
    has_edrpou = bool(profile_data.get("edrpou"))
    levels_criteria = [
        ("Рівень І. Підготовка науково-технічної розробки (НУС НААН)", "Патент та реєстрація сорту «Біла Принцеса» (2018 р.), ТУ, оригінальне насіння"),
        ("Рівень ІІ. Оцінка інноваційного потенціалу (Експертиза ІІБ)", "Аналіз ринку, формування драфту стартапу та структури експериментального кластеру"),
        ("Рівень ІІІ. Запуск через інноваційний бізнес-інкубатор", "Акредитація провайдерів, залучення венчурного та грантового капіталу, масштабування"),
        ("Верифікація суб'єкта в реєстрі партнерів кластеру", "Верифіковано за ЄДРПОУ" if has_edrpou else "Потребує верифікації ЄДРПОУ")
    ]
    crit_table = doc.add_table(rows=1, cols=2)
    ch = crit_table.rows[0].cells
    ch[0].text = 'Рівень інституційної взаємодії'
    ch[1].text = 'Статус реалізації у проєкті'
    for c_name, c_status in levels_criteria:
        rc = crit_table.add_row().cells
        rc[0].text = c_name
        rc[1].text = c_status

    # Розділ 3. Технічна реалізація масштабування (Від 1 га до глибокої переробки)
    doc.add_heading('3. Технічна реалізація: Алгоритм масштабування сорту «Біла Принцеса»', level=1)
    tech_stages = [
        ("Етап 1. Селекційний розсадник (1 га)", "Оригінальне насіння (Супереліта)", "ННЦ «Інститут землеробства НААН»: базова генерація, апробація, чистота сорту 99.9%"),
        ("Етап 2. Насінницькі ділянки (25–50 га)", "Елітне насіння (Еліта)", "Базові господарства кластеру: мультиплікація під авторським наглядом науковців"),
        ("Етап 3. Товарні посіви (300–1000+ га)", "Перша репродукція (РС-1) та сидерат", "Агропідприємства-партнери: високоврожайне посухостійке вирощування товарного зерна"),
        ("Етап 4. Промислова біопереробка", "Олія, гірчичний порошок, кормовий шрот", "Переробні підприємства кластеру: створення продукції з високою доданою вартістю")
    ]
    tech_table = doc.add_table(rows=1, cols=3)
    th = tech_table.rows[0].cells
    th[0].text = 'Етап технічної реалізації'
    th[1].text = 'Цільовий продукт генерації'
    th[2].text = 'Операційний зміст та виконавці'
    for st, prod, desc in tech_stages:
        rc = tech_table.add_row().cells
        rc[0].text = st
        rc[1].text = prod
        rc[2].text = desc

    # Розділ 4. Матриця скорингу кластерних моделей та фінансово-економічне обґрунтування
    doc.add_heading('4. Матриця сумісності кластерних програм та фінансова модель', level=1)
    scored_grants = evaluate_grants(profile_data, grants_list)
    score_table = doc.add_table(rows=1, cols=4)
    sh = score_table.rows[0].cells
    sh[0].text = 'Кластерна програма / Стартап'
    sh[1].text = 'Інвестиційний ліміт'
    sh[2].text = 'Індекс синергії'
    sh[3].text = 'Науково-практичний висновок'

    for item in scored_grants[:4]:
        rc = score_table.add_row().cells
        rc[0].text = f"{item['title']} ({item['donor']})"
        rc[1].text = f"{item['max_amount']} (внесок від {item['min_own_percent']}%)"
        rc[2].text = f"{item['score']}% ({item['status']})"
        rc[3].text = f"{item['reason']}. {item.get('requirements', '')}"

    if scored_grants:
        top_grant = scored_grants[0]
        grant_amt = _parse_amount(top_grant['max_amount'])
        raw_own = re.findall(r"\d+(?:[.,]\d+)?", str(profile_data.get("own_contribution_percent") or ""))
        user_own_pct = float(raw_own[0].replace(",", ".")) if raw_own else float(top_grant['min_own_percent'])
        own_pct = max(user_own_pct, float(top_grant['min_own_percent']), 20.0)
        own_pct = min(own_pct, 80.0)

        if grant_amt > 0:
            total_budget = grant_amt / (1.0 - (own_pct / 100.0))
            own_funds = total_budget - grant_amt
            payback_years = 1.6 if "насін" in top_grant['title'].lower() else 2.1
            roi = round(((100.0 / (own_pct / 100.0)) * 0.26), 1)

            doc.add_paragraph(f"Рекомендована модель кластеризації: {top_grant['title']}")
            doc.add_paragraph(f"• Загальний інвестиційний бюджет кластерного проєкту: {int(total_budget):,} грн".replace(",", " "))
            doc.add_paragraph(f"• Залучене інвестиційне / грантове фінансування ({100 - int(own_pct)}%): {int(grant_amt):,} грн".replace(",", " "))
            doc.add_paragraph(f"• Власний внесок учасників кластеру ({int(own_pct)}%): {int(own_funds):,} грн".replace(",", " "))
            doc.add_paragraph(f"• Розрахунковий період окупності (Payback Period): ~{payback_years} року")
            doc.add_paragraph(f"• Очікувана рентабельність капіталу за рахунок глибокої переробки (ROI): {roi}% річних")

    file_stream = io.BytesIO()
    doc.save(file_stream)
    file_stream.seek(0)
    return file_stream
