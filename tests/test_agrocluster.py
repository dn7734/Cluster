"""
АВТОМАТИЗОВАНИЙ ТЕСТОВИЙ КОНТУР (tests/test_agrocluster.py):
Комплексне Unit, Integration, API та E2E тестування платформи «AgroCluster Analytics» (Версія 3.0).
Перевіряє:
1. Економіко-математичну модель Драфту ТОВ «ІІБ» за даними «1_Драфт.pptx» (подвійний вихід, роялті НААН ×4.6, точка входу);
2. Парсер та галузевий КВЕД-фільтр юридичних осіб за ЄДРПОУ (Тільки Аграрії, Переробники та НУС НААН);
3. Блокування неаграрних компаній (банки, ІТ, непродовольчий ритейл);
4. Правило комерційного Оператора подачі на грант (делегування від бюджетної НУС НААН до Провайдера ТОВ «ІІБ»);
5. Серверні ендпоінти FastAPI, генерацію DOCX-угоди та конфігурацію Firebase Hosting + Cloud Run + Data Connect;
6. Повну відсутність залежностей або посилань на Telegram / AgroGrant_Bot.
"""

import os
import sys
import json
import uuid
import zipfile
import asyncio
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from agro_registry_service import (
    is_agro_kved,
    classify_cluster_role,
    resolve_grant_operator,
    verify_and_parse_edrpou,
    search_agro_companies
)
from grant_scraper import evaluate_grants, DEFAULT_GRANTS
from doc_generator import create_grant_document
import main as backend_main


class TestAgroClusterPlatformV3(unittest.TestCase):

    def test_01_iib_draft_economic_matrix_1000ha(self):
        """Перевірка математичної моделі Драфту ІІБ на 1000 га (слайд 8–11 «1_Драфт.pptx»)."""
        res = backend_main.calculate_iib_draft_economics(
            area_ha=1000,
            yield_t_ha=2.0,
            processing_pct=60,
            prepay_pct=30
        )
        self.assertEqual(res["area"], 1000)
        self.assertEqual(res["totalHarvestTons"], 2000)
        self.assertEqual(res["tonsProcessed"], 1200)
        self.assertEqual(res["tonsSiderat"], 800)
        self.assertEqual(res["procPct"] + res["sideratPct"], 100)
        # Перевірка фракцій переробки (слайд 10 «1_Драфт.pptx»: порошок 50%, олія 30%, шрот 15%)
        self.assertAlmostEqual(res["powderTons"], 600.0)
        self.assertAlmostEqual(res["oilTons"], 360.0)
        self.assertAlmostEqual(res["mealTons"], 180.0)
        # Перевірка вигоди НААН (слайд 11: соло = 46 тис. грн, у кластері зростання >= 4.6 раза)
        self.assertEqual(res["naanSoloUah"], 46000)
        self.assertGreaterEqual(res["naanMultiplier"], 4.6)
        self.assertGreater(res["mar1"], res["naanSoloUah"] * 4.6)
        # Перевірка точки інвестиційного входу та загальної маржі
        self.assertGreater(res["investmentEntryUah"], 1000000)
        self.assertGreater(res["totalMargin"], res["rawOnlyMargin"])

    def test_02_agro_kved_filter_accepts_only_agrarians(self):
        """Перевірка жорсткого фільтра КВЕД: пропускає аграріїв, насінництво, олійну переробку та НААН."""
        ok_farm, code_farm = is_agro_kved("01.11 Вирощування зернових і насіння олійних культур", "ФГ Подільський Колос")
        self.assertTrue(ok_farm)
        self.assertEqual(code_farm, "01.11")

        ok_seed, code_seed = is_agro_kved("01.64 Оброблення насіння для відтворення", "ДП ДГ Чабани")
        self.assertTrue(ok_seed)
        self.assertEqual(code_seed, "01.64")

        ok_proc, code_proc = is_agro_kved("10.41 Виробництво олії та тваринних жирів", "ТОВ Агро-Еко Переробка")
        self.assertTrue(ok_proc)
        self.assertEqual(code_proc, "10.41")

        ok_spice, code_spice = is_agro_kved("10.84 Виробництво прянощів і приправ", "Гірчичний завод")
        self.assertTrue(ok_spice)
        self.assertEqual(code_spice, "10.84")

        ok_naan, code_naan = is_agro_kved("72.19 Дослідження й експериментальні розробки", "ННЦ Інститут землеробства НААН")
        self.assertTrue(ok_naan)
        self.assertEqual(code_naan, "72.19")

    def test_03_agro_kved_filter_rejects_non_agrarians(self):
        """Перевірка блокування неаграрних юридичних осіб (банки, ритейл, ІТ, будівництво)."""
        for bad_edrpou in ["14360570", "40075815", "38567241"]:
            parsed = verify_and_parse_edrpou(bad_edrpou)
            self.assertFalse(parsed["ok"], f"ЄДРПОУ {bad_edrpou} мав бути відхилений як неаграрний!")
            self.assertEqual(parsed["error_code"], "NON_AGRO_REJECTED")

        # Перевірка довільного ЄДРПОУ з неаграрним КВЕД у контексті
        bad_custom = verify_and_parse_edrpou("99887766", context_text="ТОВ БудМонтаж КВЕД 41.20 будівництво")
        self.assertFalse(bad_custom["ok"])
        self.assertEqual(bad_custom["error_code"], "NON_AGRO_REJECTED")

    def test_04_provider_grant_operator_rule_for_naan(self):
        """
        Перевірка правила керівника ІІБ (11:55 аудіо):
        Бюджетна установа НААН (00496802) не подається на грант напряму — заявником стає ТОВ «ІІБ» (40125890).
        """
        naan_prof = verify_and_parse_edrpou("00496802")
        self.assertTrue(naan_prof["ok"])
        op = naan_prof["grant_operator"]
        self.assertTrue(op["is_delegated_to_provider"])
        self.assertEqual(op["operator_edrpou"], "40125890")
        self.assertIn("ІНСТИТУТ ІННОВАЦІЙНОЇ БІОЕКОНОМІКИ", op["operator_name"])

        # А приватне ФГ «Подільський Колос» (03728915) може виступати прямим комерційним заявником
        farm_prof = verify_and_parse_edrpou("03728915")
        self.assertTrue(farm_prof["ok"])
        op_farm = farm_prof["grant_operator"]
        self.assertFalse(op_farm["is_delegated_to_provider"])
        self.assertEqual(op_farm["operator_edrpou"], "03728915")

    def test_05_startup_lot_scoring_and_docx_generation(self):
        """Перевірка ранжування Стартап-лотів (~100 тис. € / до 8 млн грн) та генерації DOCX-угоди."""
        naan_prof = verify_and_parse_edrpou("00496802")
        scored = evaluate_grants(naan_prof, DEFAULT_GRANTS)
        self.assertEqual(len(scored), 4)
        self.assertEqual(scored[0]["operator_edrpou"], "40125890")

        docx_stream = create_grant_document(naan_prof, DEFAULT_GRANTS)
        docx_bytes = docx_stream.read()
        self.assertGreater(len(docx_bytes), 10000)

        # Перевіряємо, що DOCX є валідним архівом OpenXML і не містить згадок про Telegram / AgroGrant_Bot
        with zipfile.ZipFile( io_bytes := __import__("io").BytesIO(docx_bytes) ) as zf:
            xml_content = zf.read("word/document.xml").decode("utf-8")
            self.assertIn("БІЛА ПРИНЦЕСА", xml_content.upper())
            self.assertIn("40125890", xml_content)
            self.assertIn("4,6", xml_content)
            self.assertNotIn("AgroGrant_Bot", xml_content)
            self.assertNotIn("Telegram", xml_content)

    def test_06_backend_api_endpoints_and_chat(self):
        """Перевірка серверних функцій FastAPI (health, /api/edrpou, /api/draft-calc, /chat)."""
        health = backend_main.health_check()
        self.assertEqual(health["status"], "ok")
        self.assertFalse(health["telegram_used"])

        search_res = backend_main.list_or_search_agro_edrpou(q="Переробка", role="")
        self.assertGreaterEqual(search_res["total"], 1)

        ok_resp = backend_main.verify_edrpou_endpoint("41258963", context="", request=None)
        self.assertTrue(ok_resp["ok"])
        self.assertEqual(ok_resp["cluster_role_code"], "DEEP_PROCESSOR")

        reject_resp = backend_main.verify_edrpou_endpoint("14360570", context="", request=None)
        self.assertEqual(reject_resp.status_code, 422)

        # Тест асинхронного чату координатора ІІБ
        chat_req = backend_main.ChatRequest(message="Код ЄДРПОУ 03754120, СТОВ Агрофірма Світанок, 1000 га")
        chat_res = asyncio.run(
            backend_main.chat_with_coordinator(uuid.uuid4(), chat_req, type("DummyReq", (), {"client": None})())
        )
        self.assertFalse(chat_res["is_error"])
        self.assertEqual(chat_res["profile"]["edrpou"], "03754120")

    def test_07_frontend_and_firebase_cloud_run_configs(self):
        """Перевірка HTML/JS/CSS, конфігурації Firebase Hosting + Cloud Run + Data Connect та відсутності Telegram."""
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

        with open(os.path.join(base_dir, "index.html"), encoding="utf-8") as f:
            html_text = f.read()
        self.assertIn("Надбудова над ланцюгом: ТОВ «Інститут інноваційної біоекономіки»", html_text)
        self.assertIn("За кадром • Наукова Новація (1 га)", html_text)
        self.assertIn("Вихід А: Сидерат | Вихід Б: Переробка", html_text)
        self.assertNotIn("AgroGrant_Bot", html_text)
        self.assertNotIn("cluster-fcsu.onrender.com", html_text)

        with open(os.path.join(base_dir, "script.js"), encoding="utf-8") as f:
            js_text = f.read()
        self.assertIn("resolveGrantOperatorClient", js_text)
        self.assertIn("NON_AGRO_REJECT_LIST", js_text)
        self.assertNotIn("AgroGrant_Bot", js_text)
        self.assertNotIn("cluster-fcsu.onrender.com", js_text)

        with open(os.path.join(base_dir, "firebase.json"), encoding="utf-8") as f:
            fb_cfg = json.load(f)
        self.assertIn("hosting", fb_cfg)
        self.assertIn("dataconnect", fb_cfg)
        rewrites = fb_cfg["hosting"]["rewrites"]
        self.assertTrue(any(r.get("run", {}).get("serviceId") == "agrocluster-api" for r in rewrites))

    def test_08_live_uvicorn_http_e2e(self):
        """E2E перевірка запущеного HTTP-сервера Uvicorn по мережевому сокету."""
        import subprocess
        import time
        import urllib.request
        import urllib.error

        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "18085"],
            cwd=base_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            ready = False
            for _ in range(30):
                try:
                    with opener.open("http://127.0.0.1:18085/api/health", timeout=1) as r:
                        if r.status == 200:
                            ready = True
                            break
                except Exception:
                    time.sleep(0.2)
            self.assertTrue(ready, "Uvicorn сервер не запустився на порту 18085")

            with opener.open("http://127.0.0.1:18085/api/edrpou/03728915") as r:
                data = json.loads(r.read().decode("utf-8"))
                self.assertTrue(data["ok"])
                self.assertTrue(data["is_agro"])

            with self.assertRaises(urllib.error.HTTPError) as ctx:
                opener.open("http://127.0.0.1:18085/api/edrpou/14360570")
            self.assertEqual(ctx.exception.code, 422)
        finally:
            proc.terminate()
            proc.wait()
            if proc.stdout:
                proc.stdout.close()
            if proc.stderr:
                proc.stderr.close()

    def test_09_pricing_accordion_and_product_balance_breakdown(self):
        """
        Перевірка динамічного розрахунку 3-компонентного балансу глибокої переробки
        та гнучких ринкових цін (Олія 30%, Порошок 50%, Шрот 15%, Фракція 5%).
        """
        # Базові налаштування
        base = backend_main.calculate_iib_draft_economics(area_ha=1000, yield_t_ha=2.0, processing_pct=60)
        self.assertEqual(base["tonsProcessed"], 1200)
        self.assertAlmostEqual(base["oilTons"], 360.0)
        self.assertAlmostEqual(base["powderTons"], 600.0)
        self.assertAlmostEqual(base["mealTons"], 180.0)
        self.assertAlmostEqual(base["seedFractionTons"], 60.0)
        self.assertEqual(base["revOil"], 360 * 90000)
        self.assertEqual(base["revPowder"], 600 * 25000)
        self.assertEqual(base["revMeal"], 180 * 10000)
        self.assertEqual(base["revSeedFraction"], 60 * 40000)
        self.assertEqual(base["rev4"], base["revOil"] + base["revPowder"] + base["revMeal"] + base["revSeedFraction"])

        # Кастомні ринкові ціни (наприклад, експортний сценарій: олія 95 тис. грн/т, порошок 28 тис. грн/т)
        custom = backend_main.calculate_iib_draft_economics(
            area_ha=1000,
            yield_t_ha=2.0,
            processing_pct=60,
            price_oil_uah_t=95000.0,
            price_powder_uah_t=28000.0,
            price_meal_uah_t=11000.0
        )
        self.assertEqual(custom["revOil"], 360 * 95000)
        self.assertEqual(custom["revPowder"], 600 * 28000)
        self.assertEqual(custom["revMeal"], 180 * 11000)
        self.assertGreater(custom["totalMargin"], base["totalMargin"])

    def test_10_doc_generator_with_detailed_processing_balance(self):
        """
        Перевірка наявності деталізованого балансу переробки (олія, порошок, шрот)
        у згенерованому DOCX-файлі рамкової угоди.
        """
        sample_prof = {
            "edrpou": "41258963",
            "company_name": "ТОВ «АГРО-ЕКО ПЕРЕРОБКА»",
            "kved": "10.41 Виробництво олії та тваринних жирів",
            "region": "Черкаська область",
            "activity_type": "Завод глибокої переробки гірчиці",
            "size_category": "Лінія екстракції та порошку Zero-Waste",
            "employees_count": "Розрахункова маржа за матрицею Драфту",
            "is_budget_institution": False
        }
        stream = create_grant_document(sample_prof, DEFAULT_GRANTS)
        self.assertIsNotNone(stream)
        stream_bytes = stream.getvalue()
        self.assertGreater(len(stream_bytes), 10000)

        # Перевірка наповнення документа через розпакування docx як zip
        with zipfile.ZipFile(stream) as zf:
            xml_content = zf.read("word/document.xml").decode("utf-8")
            self.assertIn("Біла Принцеса", xml_content)
            self.assertIn("Zero-Waste", xml_content)
            self.assertIn("олії холодного віджиму", xml_content)
            self.assertIn("гірчичного порошку", xml_content)
            self.assertIn("білкового шроту", xml_content)


if __name__ == "__main__":
    unittest.main(verbosity=2)
