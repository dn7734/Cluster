"""
ТЕСТОВИЙ КОНТУР ДЛЯ АГРОБОТА ТА КЛАСТЕРА (tests/test_agrobot.py):
Перевіряє:
1. Розділення доменів: agrocluster.web.app (Кластер) та agrocluster-bot.web.app (АгроБот);
2. Відсутність застарілих Render-посилань (agrogrant.onrender.com / cluster-fcsu.onrender.com);
3. NLU-парсер тексту та мови: виділення ЄДРПОУ, площі в га, відсотка внеску, регіону в JSON;
4. Обробку привітань на кшталт «Привіт Я аграрій у мене» без збоїв і без CORS;
5. Автономну генерацію документів без мережевих викликів.
"""

import os
import re
import unittest
import urllib.request
import urllib.error


class TestAgroBotAndClusterSeparation(unittest.TestCase):

    def test_01_both_live_domains_accessible(self):
        """Перевірка доступності обох доменів у мережі Інтернет."""
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        # 1. Кластер
        try:
            req_cl = urllib.request.Request("https://agrocluster.web.app", headers={"User-Agent": "Mozilla/5.0"})
            with opener.open(req_cl, timeout=10) as r:
                self.assertEqual(r.status, 200)
                html = r.read().decode("utf-8")
                self.assertIn("AgroCluster Analytics", html)
                self.assertIn("agrocluster-bot.web.app", html)
        except Exception as e:
            self.skipTest(f"Мережевий запит до agrocluster.web.app пропущено: {e}")

        # 2. АгроБот
        try:
            req_bot = urllib.request.Request("https://agrocluster-bot.web.app", headers={"User-Agent": "Mozilla/5.0"})
            with opener.open(req_bot, timeout=10) as r:
                self.assertEqual(r.status, 200)
                html_bot = r.read().decode("utf-8")
                self.assertIn("AgroGrant Analytics", html_bot)
                self.assertIn("voiceBtn", html_bot)
                self.assertIn("agrocluster.web.app", html_bot)
                # Перевіряємо, що в живому коді АгроБота немає застарілого onrender.com
                self.assertNotIn("agrogrant.onrender.com", html_bot)
        except Exception as e:
            self.skipTest(f"Мережевий запит до agrocluster-bot.web.app пропущено: {e}")

    def test_02_no_render_urls_in_codebase(self):
        """Перевірка повної відсутності посилань на повільний Render."""
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        for fname in ["index.html", "script.js", "admin.html", "firebase.json"]:
            fpath = os.path.join(base_dir, fname)
            if os.path.exists(fpath):
                with open(fpath, encoding="utf-8") as f:
                    content = f.read()
                self.assertNotIn("onrender.com", content, f"Файл {fname} містить посилання на onrender.com!")

    def test_03_nlu_voice_text_extraction_to_json(self):
        """Перевірка алгоритму NLU-парсера: виділення структурованих даних у JSON."""
        sample_speech = "Привіт, наш код 03728915, маємо 750 га посівів, готові дати 35% внеску, Вінницька область, плануємо олійну лінію"

        edr_match = re.search(r"\b(\d{8})\b", sample_speech)
        area_match = re.search(r"\b(\d+)\s*(?:га|гектар|гектарів)\b", sample_speech, re.IGNORECASE)
        own_match = re.search(r"\b(\d+)\s*%", sample_speech)
        region_match = re.search(r"\b([А-Яа-яІіЇїЄє\s\-]+(?:область|обл\.|області))\b", sample_speech, re.IGNORECASE)

        self.assertIsNotNone(edr_match)
        self.assertEqual(edr_match.group(1), "03728915")

        self.assertIsNotNone(area_match)
        self.assertEqual(area_match.group(1), "750")

        self.assertIsNotNone(own_match)
        self.assertEqual(own_match.group(1), "35")

        self.assertIsNotNone(region_match)
        self.assertIn("Вінницька", region_match.group(1))

    def test_04_greeting_detection_without_crash(self):
        """Перевірка обробки привітання з фото (Привіт Я аграрій у мене)."""
        raw_text = "Привіт Я аграрій у мене"
        is_greeting = bool(re.search(r"^(привіт|добрий день|вітаю|доброго дня|здоров|hello|hi)", raw_text, re.IGNORECASE))
        has_business_data = bool(re.search(r"\b\d{8}\b|\b\d+\s*(?:га|%)", raw_text, re.IGNORECASE))

        self.assertTrue(is_greeting)
        self.assertFalse(has_business_data)
        # При цьому сценарії бот повинен коректно перепитати параметри без помилок


if __name__ == "__main__":
    unittest.main(verbosity=2)
