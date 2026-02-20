"""
pipeline.py — Main data pipeline
Fetches each Metabase question by its named variable and exports CSV/JSON.
"""

import json
import csv
import os
from datetime import datetime
from metabase_client import MetabaseClient
import config  # all question IDs live here


OUTPUT_DIR = "output"


# ─────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────

def ensure_output_dir():
    os.makedirs(OUTPUT_DIR, exist_ok=True)


def ts():
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def save_json(data: list[dict], name: str) -> str:
    path = os.path.join(OUTPUT_DIR, f"{name}_{ts()}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)
    print(f"  💾 JSON → {path}")
    return path


def save_csv(data: list[dict], name: str) -> str:
    if not data:
        print(f"  ⚠️  No data for {name}")
        return ""
    path = os.path.join(OUTPUT_DIR, f"{name}_{ts()}.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
    print(f"  💾 CSV  → {path}")
    return path


# ─────────────────────────────────────────────────────────────────
# Question registry
# Maps a human-readable variable name → card ID from config
# Add entries here as you register more questions in config.py
# ─────────────────────────────────────────────────────────────────

QUESTIONS = {
    "sla":  config.SLA ,
    "cost": config.COST
  

    # Uncomment and fill in config.py as you add more:
    # "monthly_sales":      config.MONTHLY_SALES,
    # "active_users":       config.ACTIVE_USERS,
    # "revenue_by_region":  config.REVENUE_BY_REGION,
    # "pending_orders":     config.PENDING_ORDERS,
    # "delivery_status":    config.DELIVERY_STATUS,
}


# ─────────────────────────────────────────────────────────────────
# Pipeline
# ─────────────────────────────────────────────────────────────────

def run_pipeline(questions: dict = None) -> dict:
    """
    Fetch all registered questions and export CSV + JSON.

    Args:
        questions: dict of {label: card_id}. Defaults to QUESTIONS above.

    Returns:
        dict of {label: list_of_row_dicts}
    """
    ensure_output_dir()
    questions = questions or QUESTIONS

    client = MetabaseClient()
    client.ensure_authenticated()  # validates session, re-auths if needed

    results = {}

    for label, card_id in questions.items():
        print(f"\n🔄  Fetching: {label}  (card {card_id})")
        try:
            rows = client.run_card_json(card_id)
            save_json(rows, label)
            save_csv(rows, label)
            results[label] = rows
        except Exception as e:
            print(f"  ❌ Failed: {e}")
            results[label] = []

    # Combined report
    combined = os.path.join(OUTPUT_DIR, f"combined_{ts()}.json")
    with open(combined, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\n✅ Combined report → {combined}")

    return results


# ─────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    data = run_pipeline()

    print("\n📊 Summary:")
    for name, rows in data.items():
        print(f"  {name}: {len(rows)} rows")
