import os
import re
import json
import httpx

class LLMService:
    def __init__(self):
        self.models = [
            "gemini-2.0-flash",
            "gemini-2.5-flash",
            "gemini-flash-latest"
        ]
        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()

    async def generate_response(self, user_message: str, current_profile: dict) -> dict:
        if not self.api_key:
            return {
                "reply": "Помилка конфігурації сервера. Відсутній ключ доступу.",
                "extracted_data": {},
                "is_error": True
            }

        system_instruction = (
            "Ти інтелектуальний координатор біоекономічної платформи НААН та Інституту інноваційної біоекономіки (ІІБ). "
            "Твоя мета — сформувати паспорт учасника інноваційного аграрного кластеру (на прикладі масштабування сорту гірчиці «Біла Принцеса» "
            "від 1 га супереліти до промислової переробки на олію, порошок і кормовий шрот). "
            "Спілкуйся виключно українською мовою в академічно-діловому стилі наукового есе, лаконічно і чітко. "
            f"Поточний профіль учасника кластеру: {json.dumps(current_profile, ensure_ascii=False)}. "
            "Витягни нові дані з повідомлення користувача та запитай про 1-2 незаповнені параметри (роль у кластері, земельний банк або потужності, "
            "фокус інновацій у ланцюгу доданої вартості, частка співфінансування). "
            "Коли профіль заповнено, обґрунтуй оптимальну модель кластеризації за трьома рівнями трансферу інновацій і запропонуй завантажити драфт проєкту кластеру. "
            "ОБОВ'ЯЗКОВО повертай відповідь строго у форматі JSON з двома полями: "
            "'reply' (текст відповіді українською) та 'extracted_data' (словник із ключами: "
            "region, activity_type, size_category, employees_count, investment_focus, own_contribution_percent; "
            "значення — рядок або null)."
        )

        headers = {"Content-Type": "application/json"}
        payload = {
            "system_instruction": {"parts": [{"text": system_instruction}]},
            "contents": [{"role": "user", "parts": [{"text": user_message}]}],
            "generationConfig": {"response_mime_type": "application/json"}
        }

        last_error = "невідома помилка"
        transport = httpx.AsyncHTTPTransport(retries=3)

        async with httpx.AsyncClient(transport=transport) as client:
            for model_name in self.models:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={self.api_key}"
                try:
                    response = await client.post(url, headers=headers, json=payload, timeout=30.0)
                    if response.status_code == 200:
                        data = response.json()
                        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                        text_response = ""
                        for part in parts:
                            if not part.get("thought") and "text" in part:
                                text_response = part["text"].strip()
                        if not text_response and parts:
                            text_response = parts[-1].get("text", "").strip()

                        match = re.search(r"\{.*\}", text_response, re.DOTALL)
                        json_str = match.group(0) if match else text_response

                        try:
                            parsed = json.loads(json_str)
                            if isinstance(parsed, list) and parsed:
                                parsed = parsed[0]
                            return {
                                "reply": parsed.get("reply", text_response or "Дані учасника кластеру прийнято."),
                                "extracted_data": parsed.get("extracted_data", {}),
                                "is_error": False
                            }
                        except Exception:
                            return {
                                "reply": text_response or "Дані отримано.",
                                "extracted_data": {},
                                "is_error": False
                            }
                    else:
                        last_error = f"код {response.status_code}"
                except Exception as e:
                    last_error = f"{type(e).__name__}: {str(e)}"
                    continue

        return {
            "reply": f"Тимчасовий збій мережі на сервері. Спробуйте ще раз. ({last_error})",
            "extracted_data": {},
            "is_error": True
        }
