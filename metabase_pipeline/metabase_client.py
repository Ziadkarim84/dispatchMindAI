"""
metabase_client.py — Metabase API client
Supports session token auth (from browser) with username/password fallback.
"""

import requests
import json
import csv
import os
from typing import Optional
from config import BASE_URL, SESSION_TOKEN, METABASE_USER, METABASE_PASS, DEFAULT_QUERY_BODY


class MetabaseClient:
    def __init__(self):
        self.base_url = BASE_URL.rstrip("/")
        self.session = requests.Session()
        self._setup_headers(SESSION_TOKEN)

    def _setup_headers(self, token: str):
        self.session_token = token
        self.session.headers.update({
            "X-Metabase-Session": token,
            "Content-Type": "application/json",
            "Accept": "application/json",
        })

    # ─────────────────────────────────────────────
    # Authentication
    # ─────────────────────────────────────────────

    def authenticate(self) -> str:
        """Login with username/password and refresh session token."""
        if not METABASE_USER or not METABASE_PASS:
            raise ValueError("Set METABASE_USER and METABASE_PASS in config.py for re-authentication.")
        r = self.session.post(f"{self.base_url}/api/session", json={
            "username": METABASE_USER,
            "password": METABASE_PASS,
        })
        r.raise_for_status()
        token = r.json()["id"]
        self._setup_headers(token)
        print(f"✅ Authenticated via username/password.")
        return token

    def check_session(self) -> bool:
        """Check if the current session token is still valid."""
        r = self.session.get(f"{self.base_url}/api/user/current")
        if r.status_code == 200:
            user = r.json()
            print(f"✅ Session valid — logged in as: {user.get('email', 'unknown')}")
            return True
        else:
            print(f"⚠️  Session expired or invalid (status {r.status_code})")
            return False

    def ensure_authenticated(self):
        """Check session; re-authenticate with credentials if expired."""
        if not self.check_session():
            print("🔄 Attempting re-authentication...")
            self.authenticate()

    def logout(self):
        self.session.delete(f"{self.base_url}/api/session")
        print("👋 Logged out.")

    # ─────────────────────────────────────────────
    # Core Query Runner
    # ─────────────────────────────────────────────

    def run_card_json(self, card_id: int, parameters: list = None) -> list[dict]:
        """
        Execute a saved question and return results as list of row dicts.

        Args:
            card_id:    Metabase card/question ID
            parameters: Optional filter parameters list

        Returns:
            List of dicts, one per row
        """
        body = {**DEFAULT_QUERY_BODY, "parameters": parameters or []}
        url = f"{self.base_url}/api/card/{card_id}/query/json"

        r = self.session.post(url, json=body)

        if r.status_code == 401:
            print("⚠️  401 — session expired, re-authenticating...")
            self.authenticate()
            r = self.session.post(url, json=body)

        r.raise_for_status()
        data = r.json()
        print(f"✅ Card {card_id}: {len(data)} rows returned.")
        return data

    def run_card_csv(self, card_id: int, parameters: list = None) -> str:
        """Execute a saved question and return raw CSV string."""
        body = {**DEFAULT_QUERY_BODY, "parameters": json.dumps(parameters or [])}
        url = f"{self.base_url}/api/card/{card_id}/query/csv"

        r = self.session.post(url, data=body)
        if r.status_code == 401:
            self.authenticate()
            r = self.session.post(url, data=body)

        r.raise_for_status()
        return r.text

    # ─────────────────────────────────────────────
    # Discovery
    # ─────────────────────────────────────────────

    def list_questions(self) -> list[dict]:
        r = self.session.get(f"{self.base_url}/api/card")
        r.raise_for_status()
        return r.json()

    def list_dashboards(self) -> list[dict]:
        r = self.session.get(f"{self.base_url}/api/dashboard")
        r.raise_for_status()
        return r.json()

    def list_databases(self) -> list[dict]:
        r = self.session.get(f"{self.base_url}/api/database")
        r.raise_for_status()
        return r.json().get("data", [])

    def run_native_query(self, database_id: int, sql: str) -> dict:
        """Run a raw SQL query against a connected database."""
        r = self.session.post(f"{self.base_url}/api/dataset", json={
            "database": database_id,
            "type": "native",
            "native": {"query": sql},
        })
        r.raise_for_status()
        result = r.json()
        cols = [col["name"] for col in result["data"]["cols"]]
        rows = result["data"]["rows"]
        return {"columns": cols, "rows": [dict(zip(cols, row)) for row in rows]}
