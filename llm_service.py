"""
НАУКОВО-МЕТОДИЧНИЙ ОПИС МОДУЛЯ (llm_service.py):
Модуль інтелектуального діалогового координатора платформи «AgroCluster Analytics».
Виконує семантичний аналіз повідомлень користувача (NLU), екстракцію атрибутів паспорта
агропідприємства у форматі JSON та переклад наукової новації на мову маржі та вигоди
відповідно до методології ТОВ «Інститут інноваційної біоекономіки» (ІІБ).
"""

import os
import re
import json
import urllib.request
import urllib.error


class LLMService:
    def __init__(self):
        self.models = [
            "gemini-2.5-flash",
            "gemini-2.0-flash"
        ]
        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()

    async def generate_response(self, user_message: str, current_profile: dict) -> dict:
        if not self.api_key:
            comp = current_profile.get("company_name") or "Учасник кластеру"
            role = current_profile.get("activity_type") or "Учасник виробничо-переробного циклу"
            return {
                "reply": (
                    f"Координатор ІІБ: Профіль суб'єкта «{comp}» ({role}) інтегровано в матрицю Драфту "
                    "сорту гірчиці білої «Біла Принцеса» (1 га Супереліта НААН → 200 га Базова Еліта → "
                    "50-км зона СН-1 → Подвійний вихід: Сидерат + Глибока переробка). "
                    "Ви можете сформувати Ескізний Драфт (PDF), Вирізку Стартапу або Кластерну угоду (DOCX)."
                ),
                "extracted_data": {},
                "is_error": False
            }

        system_instruction = (
            "Ти — цифровий продюсер і координатор біоекономічної платформи ТОВ «Інститут інноваційної біоекономіки» (ІІБ), "
            "який стоїть НАД виробничим ланцюгом і перекладає наукові розробки ННЦ «Інститут землеробства НААН» "
            "(кейс: сорт гірчиці білої «Біла Принцеса», патент №180923) на мову маржі, вигоди та контрактів. "
            "Структура Драфту ІІБ: За кадром (1 га селекції НААН, 1 т супереліти) → Етап І (200 га базове насінництво Еліти: "
            "120 т кондиційної еліти + 180 т некондиції на олію) → Етап ІІ (Масштабування СН-1/СН-2 у радіусі 50 км) → "
            "Етап ІІІ (Подвійне замикання: Вихід А — Сидерат у мішках 25 кг для відновлення азоту і захисту від нематод; "
            "Вихід Б — Глибока переробка на олію 30%, порошок 50%, шрот 15% та експорт у Німеччину/Нідерланди). "
            "На гранти подає комерційний Провайдер (ТОВ «ІІБ») або приватний агропартнер, а не бюджетна установа НААН. "
            "Спілкуйся українською мовою в діловому стилі. "
            f"Поточний профіль учасника: {json.dumps(current_profile, ensure_ascii=False)}. "
            "Поверни відповідь строго у форматі JSON з двома ключами: "
            "'reply' (текст відповіді) та 'extracted_data' (словник із полями: "
            "region, activity_type, size_category, employees_count, investment_focus, own_contribution_percent)."
        )

        payload_bytes = json.dumps({
            "system_instruction": {"parts": [{"text": system_instruction}]},
            "contents": [{"role": "user", "parts": [{"text": user_message}]}],
            "generationConfig": {"response_mime_type": "application/json"}
        }).encode("utf-8")

        for model_name in self.models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={self.api_key}"
            try:
                req = urllib.request.Request(
                    url,
                    data=payload_bytes,
                    headers={"Content-Type": "application/json"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=15.0) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                        text_response = ""
                        for part in parts:
                            if not part.get("thought") and "text" in part:
                                text_response = part["text"].strip()
                        if not text_response and parts:
                            text_response = parts[-1].get("text", "").strip()

                        match = re.search(r"\{.*\}", text_response, re.DOTALL)
                        json_str = match.group(0) if match else text_response
                        parsed = json.loads(json_str)
                        if isinstance(parsed, list) and parsed:
                            parsed = parsed[0]
                        return {
                            "reply": parsed.get("reply", "Параметри учасника кластеру інтегровано до матриці Драфту ІІБ."),
                            "extracted_data": parsed.get("extracted_data", {}),
                            "is_error": False
                        }
            except Exception:
                continue

        return {
            "reply": "Дані учасника кластеру зафіксовано в матриці Драфту ІІБ. Скористайтеся кнопками генерації Драфту (PDF), Тизера Стартапу або Кластерного Договору (DOCX).",
            "extracted_data": {},
            "is_error": False
        }
