"""
config.py — Metabase credentials and question registry
"""

# ─────────────────────────────────────────────────────────────────
# Connection
# ─────────────────────────────────────────────────────────────────

BASE_URL = "https://plmb.shopup.center"

# Session token extracted from your browser cookie
# ⚠️  This expires — replace it after re-logging into Metabase
SESSION_TOKEN =""

# Fallback: username/password for re-authentication when session expires
METABASE_USER = "" # your Metabase username 
METABASE_PASS = ""   # your Metabase password


# ─────────────────────────────────────────────────────────────────
# Question Registry
# Add your Metabase questions here as:
#   VARIABLE_NAME = <card_id>
# ─────────────────────────────────────────────────────────────────

# ── Already known ──────────────────────────────────────────────
SLA         = 236824   # 4PL Active Parcels V2  (card 236420)
COST        = 236825
# ── Add more below — run discover.py to find IDs ───────────────
# MONTHLY_SALES          = 0
# ACTIVE_USERS           = 0
# REVENUE_BY_REGION      = 0
# PENDING_ORDERS         = 0
# DELIVERY_STATUS        = 0


# ─────────────────────────────────────────────────────────────────
# Default request options
# ─────────────────────────────────────────────────────────────────

DEFAULT_QUERY_BODY = {
    "parameters": [],
    "format_rows": True,
    "pivot_results": False,
}
