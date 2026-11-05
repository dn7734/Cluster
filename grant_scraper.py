import re
import json
import httpx
from html.parser import HTMLParser

class _HTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.chunks = []

    def handle_data(self, data):
        clean = data.strip()
        if clean:
            self.chunks.append(clean)

    def get_text(self) -> str:
        return " ".join(self.chunks)

DEFAULT_GRANTS = [
    {
        "code": "cluster_white_princess_seed",
        "title": "Кластерний стартап «Біла Принцеса»: Базове та елітне насінництво",
        "donor": "Інститут землеробства НААН / ІІБ",
        "max_amount": "до 6 500 000 грн",
        "min_own_percent": 25,
        "target_kveds": "01.11, 01.64, 72.19",
        "land_req": "від 1 га (супереліта) до 300 га (І репродукція)",
        "keywords": ["гірчиц", "біла принцеса", "насін", "супереліт", "еліт", "репродукц", "селекц", "зерн"],
        "requirements": "Ліцензійна угода з НУС НААН, дотримання просторової ізоляції та сертифікація насіння."
    },
    {
        "code": "cluster_deep_processing",
        "title": "Біоекономічний кластер глибокої переробки (Олія, порошок, шрот)",
        "donor": "ІІБ / Мінекономіки (Грант на переробку)",
        "max_amount": "до 8 000 000 грн",
        "min_own_percent": 20,
        "target_kveds": "10.41, 10.61, 10.84, 10.91",
        "land_req": "Виробничий цех / лінія холодного пресування",
        "keywords": ["перероб", "олійн", "олія", "порошок", "шрот", "екстракц", "лінія", "цех"],
        "requirements": "Інтеграція в ланцюг доданої вартості кластеру, безвідходна біоекономічна технологія."
    },
    {
        "code": "cluster_science_transfer",
        "title": "Експериментальний кластер трансферу ОІВ (Платформа Наука–Бізнес)",
        "donor": "НААН України / Венчурний інкубатор ІІБ",
        "max_amount": "до 5 000 000 грн",
        "min_own_percent": 15,
        "target_kveds": "72.11, 72.19, 70.22, 01.11",
        "land_req": "Дослідно-демонстраційний полігон від 1 га",
        "keywords": ["наук", "трансфер", "патент", "інновац", "драфт", "інкубатор", "кластер", "оів"],
        "requirements": "Наявність охоронного документа на сорт/технологію, розробка ескізного проєкту (драфту) з ІІБ."
    },
    {
        "code": "cluster_eco_siderat",
        "title": "Агроекологічний кластер сидерації та органічного землеробства",
        "donor": "Інститут землеробства НААН / ДАР",
        "max_amount": "до 4 500 000 грн",
        "min_own_percent": 30,
        "target_kveds": "01.11, 01.13, 01.61",
        "land_req": "від 50 до 500 га",
        "keywords": ["сидерат", "органіч", "біофумігац", "родюч", "еколог", "експорт"],
        "requirements": "Впровадження сівозмін із білою гірчицею для оздоровлення ґрунтів та зменшення пестицидного навантаження."
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

    scored = []
    for g in catalog:
        score = 58
        reasons = []

        kw_list = g.get("keywords", [])
        if isinstance(kw_list, str):
            kw_list = [k.strip() for k in kw_list.split(",") if k.strip()]

        matched_kw = [kw for kw in kw_list if kw in combined_text]
        if matched_kw:
            score += 26
            reasons.append("Технологічна ланка кластеру збігається")

        target_kveds = g.get("target_kveds", "")
        if kved and any(prefix.strip()[:4] in kved for prefix in target_kveds.split(",") if prefix.strip()):
            score += 12
            reasons.append("КВЕД відповідає спеціалізації у кластері")

        min_own = float(g.get("min_own_percent") or 0)
        if min_own == 0:
            score += 5
            reasons.append("Базова інституційна підтримка")
        elif own_pct >= min_own:
            score += 10
            reasons.append(f"Власне співфінансування покриває поріг ({int(min_own)}%)")
        elif own_pct > 0 and own_pct < min_own:
            score -= 12
            reasons.append(f"Рекомендований внесок партнера від {int(min_own)}%")

        score = max(30, min(98, score))
        status = "Пріоритетна модель" if score >= 75 else "Доступно для інтеграції"

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
            "reason": "; ".join(reasons) if reasons else "Відповідає базовим критеріям кластеризації НААН–ІІБ"
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored

async def scrape_and_normalize_grants(api_key: str = "") -> list:
    if not api_key:
        return DEFAULT_GRANTS
    return DEFAULT_GRANTS
