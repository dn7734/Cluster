"""
НАУКОВО-МЕТОДИЧНИЙ ОПИС МОДУЛЯ (grant_scraper.py):
Модуль багатокритеріального скорингу та «вирізки Стартап-лотів» із загального Драфту кластеру
під конкретні фінансові інструменти (оптимальний грант близько 100 тис. € / 4,5-5 млн грн, державний грант
на переробку до 8 млн грн, форвардне авансування від заводу-переробника у радіусі 50 км, посівний лот 10 тис. €).
Враховує правило ІІБ: комерційним Заявником виступає Провайдер (ТОВ «ІІБ») або приватний агропартнер,
а не бюджетна установа НААН.
"""

import re
from agro_registry_service import resolve_grant_operator

DEFAULT_GRANTS = [
    {
        "code": "startup_lot_100k_eur",
        "title": "Стартап-лот «Базова Еліта 200 га»: Вирізка під міжнародний грант (близько 100 000 € / 4,5-5,0 млн грн)",
        "donor": "Європейські грантові платформи / Оператор подачі: Провайдер ТОВ «ІІБ»",
        "max_amount": "100 000 € (близько 4 500 000 - 5 000 000 грн)",
        "min_own_percent": 20,
        "target_kveds": "01.64, 01.11, 70.22, 72.19",
        "land_req": "1 га Супереліти (1 т опція НААН) → 200 га розмноження Базової Еліти (120 т еліти + 180 т технічної фракції)",
        "keywords": ["еліт", "супереліт", "насін", "стартап", "драфт", "біла принцеса", "розмножен", "ііб", "наук"],
        "requirements": (
            "Вирізаний з Драфту стартовий етап масштабування (2026-2027 рр.). Заявником виступає комерційний Провайдер "
            "(ТОВ «ІІБ») або базове насінницьке господарство; ННЦ «ІЗ НААН» отримує компенсацію 1 т супереліти, "
            "паушальний платіж 240 тис. грн та погектарне роялті."
        )
    },
    {
        "code": "cluster_deep_processing_8m",
        "title": "Промисловий лот «Глибока переробка Zero-Waste» (Олія 30% • Порошок 50% • Шрот 15%)",
        "donor": "Мінекономіки (єРобота: Переробка) / Консорціум ТОВ «ІІБ» & Завод переробки",
        "max_amount": "до 8 000 000 грн (безповоротно)",
        "min_own_percent": 30,
        "target_kveds": "10.41, 10.61, 10.84, 10.91",
        "land_req": "Лінія оптичного фракціонування, холодного пресування олії та помелу порошку",
        "keywords": ["перероб", "олійн", "олія", "порошок", "шрот", "фракціон", "експорт", "завод"],
        "requirements": (
            "Формування 50-км сировинної зони навколо заводу переробки за форвардними Off-take контрактами "
            "з виходом на ринок ЄС (Німеччина, Нідерланди)."
        )
    },
    {
        "code": "processor_offtake_advance_50km",
        "title": "Негрантовий інструмент: Форвардне авансування від Заводу-переробника (Радіус 50 км)",
        "donor": "Олійно-жировий комбінат / Харчовий бренд ЄС (через контрактацію ТОВ «ІІБ»)",
        "max_amount": "до 15 000 000 грн (товарний/грошовий аванс насінням та МТР під викуп врожаю)",
        "min_own_percent": 15,
        "target_kveds": "01.11, 01.64, 10.41, 10.84, 46.21",
        "land_req": "від 300 до 5 000 га товарних посівів СН-1 у радіусі 50 км від переробника",
        "keywords": ["товар", "фермер", "контракт", "офтейк", "off-take", "зерн", "гірчиц", "50 км"],
        "requirements": (
            "Завод-переробник авансує закупівлю сертифікованого насіння «Біла Принцеса» (з потрібною кислотністю й олійністю) "
            "та гарантовано викупає 100% товарного врожаю."
        )
    },
    {
        "code": "cluster_eco_siderat_10k_eur",
        "title": "Мікро-лот «Сидеральний та Фітосанітарний конвеєр» (Фасування мішків 25 кг)",
        "donor": "Міжнародні еко-фонди / Програми біологізації землеробства (10 000 - 50 000 €)",
        "max_amount": "до 50 000 € (близько 2 200 000 грн)",
        "min_own_percent": 25,
        "target_kveds": "01.11, 01.61, 01.64, 01.49",
        "land_req": "від 50 до 1 000 га (сидерація, відновлення азоту, захист від нематод, медозбір)",
        "keywords": ["сидерат", "органіч", "біофумігац", "нематод", "азот", "медозбір", "мішки"],
        "requirements": (
            "Випуск фасованого насіння І/ІІ репродукції у мішках по 25 кг (42 000 грн/т) для фермерських господарств "
            "(чисті посіви 10-12 кг/га, фітосанітарні проти нематод 25-30 кг/га)."
        )
    }
]


def _extract_number(val: str) -> float:
    if not val:
        return 0.0
    nums = re.findall(r"\d+(?:[.,]\d+)?", str(val))
    if not nums:
        return 0.0
    return float(nums[0].replace(",", "."))


def evaluate_grants(profile_data: dict, grants: list = None) -> list:
    catalog = grants if grants else DEFAULT_GRANTS
    activity = (profile_data.get("activity_type") or "").lower()
    focus = (profile_data.get("investment_focus") or "").lower()
    kved = (profile_data.get("kved") or "").lower()
    own_pct = _extract_number(profile_data.get("own_contribution_percent") or "")
    combined_text = f"{activity} {focus} {kved}"

    operator_info = resolve_grant_operator(profile_data)

    scored = []
    for g in catalog:
        score = 68
        reasons = []
        kw_list = g.get("keywords", [])
        if isinstance(kw_list, str):
            kw_list = [k.strip() for k in kw_list.split(",") if k.strip()]

        matched_kw = [kw for kw in kw_list if kw in combined_text]
        if matched_kw:
            score += 20
            reasons.append("Спеціалізація учасника відповідає цільовій ланці Драфту ІІБ")

        target_kveds = g.get("target_kveds", "")
        if kved and any(prefix.strip()[:4] in kved for prefix in target_kveds.split(",") if prefix.strip()):
            score += 8
            reasons.append("Аграрний/переробний КВЕД підтверджено")

        min_own = float(g.get("min_own_percent") or 0)
        if own_pct >= min_own:
            score += 6
            reasons.append(f"Власний внесок покриває поріг ({int(min_own)}%)")

        if operator_info["is_delegated_to_provider"]:
            reasons.append(
                f"Оператор подачі: {operator_info['operator_name']} (бюджетна НУС НААН залучена як ліцензіар ОІВ)"
            )
        else:
            reasons.append(f"Заявник: {operator_info['operator_name']}")

        score = max(40, min(99, score))
        status = "Пріоритетний лот стартапу" if score >= 78 else "Доступно у кластері ІІБ"

        scored.append({
            "code": g.get("code"),
            "title": g.get("title"),
            "donor": g.get("donor"),
            "max_amount": g.get("max_amount"),
            "min_own_percent": int(min_own),
            "target_kveds": target_kveds,
            "land_req": g.get("land_req"),
            "requirements": g.get("requirements"),
            "score": score,
            "status": status,
            "operator_name": operator_info["operator_name"],
            "operator_edrpou": operator_info["operator_edrpou"],
            "is_delegated_to_provider": operator_info["is_delegated_to_provider"],
            "reason": "; ".join(reasons)
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored


async def scrape_and_normalize_grants(api_key: str = "") -> list:
    return DEFAULT_GRANTS
