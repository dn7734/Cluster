"""
Модуль прямої інтеграції бекенду AgroCluster Analytics v3.0 із Firebase Cloud Firestore REST API.
Працює через сервісний акаунт проєкту `gen-lang-client-0227701733` без зовнішніх важких залежностей,
підтримуючи синхронізацію:
  - Реєстру верифікованих аграрних юридичних осіб за ЄДРПОУ/КВЕД (`agro_entities`)
  - Розрахунків Ескізного Проєкту / Драфту ТОВ «ІІБ» (`draft_projects`)
  - Кластерних лідів та заявок на грантові стартап-лоти (`cluster_leads`)
"""

import base64
import json
import logging
import os
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "gen-lang-client-0227701733")
FIREBASE_WEB_CONFIG = {
    "projectId": "gen-lang-client-0227701733",
    "appId": "1:406478061283:web:3b4475e4c71208da764fd6",
    "storageBucket": "gen-lang-client-0227701733.firebasestorage.app",
    "apiKey": "AIzaSyAe5WQ2t3hhJU8clq2BCPOWZvUXzk_P96E",
    "authDomain": "gen-lang-client-0227701733.firebaseapp.com",
    "messagingSenderId": "406478061283",
    "projectNumber": "406478061283"
}

_TOKEN_CACHE: Dict[str, Any] = {"token": None, "expires_at": 0}


def _load_service_account() -> Optional[Dict[str, Any]]:
    """Завантажує JSON сервісного акаунта з env або локального захищеного файлу."""
    env_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if env_json:
        try:
            return json.loads(env_json)
        except Exception as e:
            logger.warning(f"Помилка парсингу FIREBASE_SERVICE_ACCOUNT_JSON: {e}")

    candidate_paths = [
        os.getenv("GOOGLE_APPLICATION_CREDENTIALS", ""),
        "/tmp/firebase-sa.json",
        "/home/antigravity/.gemini/firebase-sa.json"
    ]
    for path in candidate_paths:
        if path and os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Не вдалося прочитати сервісний акаунт {path}: {e}")
    return None


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def get_firebase_access_token() -> Optional[str]:
    """Отримує OAuth2 токен для Firebase / Cloud Firestore REST API."""
    now = int(time.time())
    if _TOKEN_CACHE["token"] and _TOKEN_CACHE["expires_at"] > now + 60:
        return _TOKEN_CACHE["token"]

    sa = _load_service_account()
    if not sa or "private_key" not in sa or "client_email" not in sa:
        return None

    try:
        header = _b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode("utf-8"))
        claim = _b64url(json.dumps({
            "iss": sa["client_email"],
            "scope": "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase",
            "aud": sa.get("token_uri", "https://oauth2.googleapis.com/token"),
            "exp": now + 3600,
            "iat": now
        }).encode("utf-8"))
        signing_input = f"{header}.{claim}".encode("utf-8")

        with tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False) as pf:
            pf.write(sa["private_key"])
            pem_path = pf.name

        try:
            sig = subprocess.check_output(
                ["openssl", "dgst", "-sha256", "-sign", pem_path],
                input=signing_input
            )
        finally:
            if os.path.exists(pem_path):
                os.remove(pem_path)

        jwt_assertion = f"{header}.{claim}.{_b64url(sig)}"
        payload = urllib.parse.urlencode({
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": jwt_assertion
        }).encode("utf-8")

        req = urllib.request.Request(
            sa.get("token_uri", "https://oauth2.googleapis.com/token"),
            data=payload,
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            token_data = json.loads(resp.read().decode("utf-8"))
            _TOKEN_CACHE["token"] = token_data["access_token"]
            _TOKEN_CACHE["expires_at"] = now + int(token_data.get("expires_in", 3500))
            return _TOKEN_CACHE["token"]
    except Exception as e:
        logger.warning(f"Помилка отримання токена Firebase: {e}")
        return None


def _to_firestore_fields(data: Dict[str, Any]) -> Dict[str, Any]:
    """Конвертує звичайний Python-словник у формат полів Firestore REST API."""
    fields: Dict[str, Any] = {}
    for k, v in data.items():
        if v is None:
            fields[k] = {"nullValue": None}
        elif isinstance(v, bool):
            fields[k] = {"booleanValue": v}
        elif isinstance(v, int):
            fields[k] = {"integerValue": str(v)}
        elif isinstance(v, float):
            fields[k] = {"doubleValue": v}
        elif isinstance(v, str):
            fields[k] = {"stringValue": v}
        else:
            fields[k] = {"stringValue": json.dumps(v, ensure_ascii=False)}
    return {"fields": fields}


def sync_document_to_firestore(collection: str, doc_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Зберігає документ у колекцію Cloud Firestore проєкту `gen-lang-client-0227701733`.
    Повертає статус синхронізації.
    """
    token = get_firebase_access_token()
    if not token:
        return {"synced": False, "reason": "NO_SERVICE_ACCOUNT"}

    safe_id = urllib.parse.quote(str(doc_id), safe="")
    url = (
        f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}"
        f"/databases/(default)/documents/{collection}/{safe_id}"
    )
    body = json.dumps(_to_firestore_fields(data)).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        method="PATCH"
    )
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return {"synced": True, "document": result.get("name", f"{collection}/{doc_id}")}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        return {"synced": False, "http_status": e.code, "reason": err_body[:240]}
    except Exception as e:
        return {"synced": False, "reason": str(e)}


def get_firebase_connection_status() -> Dict[str, Any]:
    """Перевіряє статус підключення до Firebase проєкту та Firestore."""
    token = get_firebase_access_token()
    status_info: Dict[str, Any] = {
        "project_id": FIREBASE_PROJECT_ID,
        "web_app_id": FIREBASE_WEB_CONFIG["appId"],
        "hosting_url": f"https://{FIREBASE_PROJECT_ID}.web.app",
        "service_account_authenticated": bool(token),
        "firestore_status": "UNCHECKED"
    }
    if not token:
        status_info["firestore_status"] = "NO_CREDENTIALS"
        return status_info

    url = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            dbs = json.loads(resp.read().decode("utf-8")).get("databases", [])
            if dbs:
                status_info["firestore_status"] = "ACTIVE"
                status_info["databases"] = [d.get("name") for d in dbs]
            else:
                status_info["firestore_status"] = "AWAITING_CONSOLE_INIT"
    except Exception as e:
        status_info["firestore_status"] = f"ERROR: {e}"
    return status_info
