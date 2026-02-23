<div align="center">

```
██████╗ ██╗███████╗██████╗  █████╗ ████████╗ ██████╗██╗  ██╗
██╔══██╗██║██╔════╝██╔══██╗██╔══██╗╚══██╔══╝██╔════╝██║  ██║
██║  ██║██║███████╗██████╔╝███████║   ██║   ██║     ███████║
██║  ██║██║╚════██║██╔═══╝ ██╔══██║   ██║   ██║     ██╔══██║
██████╔╝██║███████║██║     ██║  ██║   ██║   ╚██████╗██║  ██║
╚═════╝ ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝
███╗   ███╗██╗███╗   ██╗██████╗      █████╗ ██╗
████╗ ████║██║████╗  ██║██╔══██╗    ██╔══██╗██║
██╔████╔██║██║██╔██╗ ██║██║  ██║    ███████║██║
██║╚██╔╝██║██║██║╚██╗██║██║  ██║    ██╔══██║██║
██║ ╚═╝ ██║██║██║ ╚████║██████╔╝    ██║  ██║██║
╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═════╝     ╚═╝  ╚═╝╚═╝
```

### 🤖 AI-Driven Autonomous Dispatch Optimization Engine

[![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Claude AI](https://img.shields.io/badge/Claude-Sonnet_4.6-CC785C?style=for-the-badge&logo=anthropic&logoColor=white)](https://anthropic.com)
[![Express](https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://mysql.com)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://dispatch-mind-ai-beta.vercel.app)

**🌐 Live API:** `https://dispatch-mind-ai-beta.vercel.app`

</div>

---

## ⚡ What is DispatchMindAI?

**DispatchMindAI** is an autonomous decision engine for **RedX**, Bangladesh's leading last-mile logistics platform. It uses a multi-agent AI pipeline powered by **Claude Sonnet 4.6** to make real-time dispatch decisions — choosing between internal fleet (3PL) and external delivery partners (4PL) based on live cost modeling, SLA risk analysis, and hub profitability projections.

> *"Stop guessing. Start dispatching intelligently."*

---

## 🧠 The AI Agent Pipeline

Six agents run sequentially for each dispatch decision:

```
Parcel In
    │
    ▼
┌─────────────────┐     ┌──────────────────┐
│  AGENT 1        │────►│  AGENT 2         │
│  Volume         │     │  Cost Modeling   │
│  Forecast       │     │  (3PL/4PL margin)│
└─────────────────┘     └────────┬─────────┘
                                 │
                    ┌────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  AGENT 3: SLA Risk Analyzer             │
│  Breach probability per partner/area    │
└─────────────────────┬───────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│  AGENT 4: Partner Evaluation            │
│  Ranks partners by margin × reliability │
└─────────────────────┬───────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│  AGENT 5: Executive Summary             │
│  Plain-English decision report          │
└─────────────────────┬───────────────────┘
                      │
                      ▼
              Dispatch Decision
              + Reasoning Report

── Hub endpoints only ──────────────────────
┌─────────────────────────────────────────┐
│  AGENT 6: Network Strategy              │
│  Keep / Close / Convert + 90d margin    │
└─────────────────────────────────────────┘
```

Each agent queries a **pre-aggregated MySQL database**, calls **Claude Sonnet 4.6**, and passes its structured output to the next agent. The Network Strategy agent runs only for hub-level endpoints (`/profitability`, `/model-advice`).

---

## 🎯 Features

| Feature | Description |
|---------|-------------|
| 🚚 **AI Dispatch** | Decides 3PL vs 4PL per shipment — hub auto-detected from area |
| 📊 **Hub Profitability** | Predicts 90-day margin, recommends keep / close / convert |
| 🏗️ **Model Advisor** | Compares 3PL-only vs 4PL-only vs Hybrid operating costs |
| 🏥 **Hub Health** | Fleet-wide scan — identifies losing hubs, suggests partner reassignments |
| ↔️ **Partner Assignment** | One-click area-to-partner reassignment written directly to the database |
| 📝 **Dispatch Reasoning** | Plain-English explanation of every AI decision |
| 🕓 **Decision History** | In-memory audit trail of last 50 dispatch decisions |

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Express API (port 3000)                  │
│                 Deployed on Vercel (60s timeout)            │
├───────────────┬──────────────────────────────────────────  ┤
│   dispatch/   │                 hubs/                       │
│  recommend    │   summary · assign-partners · profitability │
│  history      │   model-advice · costs (CRUD)               │
├───────────────┴──────────────────────────────────────────  ┤
│                    Agent Orchestrator                        │
│  VolumeForecast → CostModeling → SLARisk →                  │
│  PartnerEvaluation → ExecutiveSummary                        │
│  NetworkStrategy (hub endpoints)                            │
│  HubSummary (fleet-wide, single Claude call, ~10s)          │
├────────────────────────────────────────────────────────────┤
│               Claude Sonnet 4.6 (Anthropic)                 │
├──────────────────────────┬─────────────────────────────────┤
│   Railway MySQL           │   stage1_shopuplite             │
│   (Production, read/write)│   (Internal DB, read-only)      │
│   sl_* + dm_* tables      │   source of truth for sync      │
└──────────────────────────┴─────────────────────────────────┘
```

### Layer Structure

```
src/
├── agents/          # AI agents (one file per agent + base.agent.ts)
├── modules/
│   ├── dispatch/    # controller → service → agents
│   ├── partners/    # SLA risk + partner evaluation
│   └── hubs/        # profitability, model advice, health summary, costs
├── database/
│   ├── connection.ts
│   ├── sync.ts          # stage → local copy
│   ├── aggregate.ts     # refresh dm_* tables
│   └── migrations/
├── common/          # middleware, error classes, logger, response formatter
└── config/          # Zod env validation, app config, DB config
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 22+
- Docker (for local MySQL)
- Anthropic API key

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in DB_*, ANTHROPIC_API_KEY

# 3. Start local database
npm run db:up

# 4. Sync data from stage (requires Teleport access)
npm run db:sync

# 5. Populate aggregation tables
npm run db:aggregate

# 6. Start the server
npm run dev
```

The server starts on `http://localhost:3000`.

---

## 📡 API Reference

All responses are wrapped in:
```json
{ "success": true, "data": {}, "meta": { "timestamp": "...", "requestId": "uuid" } }
```

### `POST /api/v1/dispatch/recommend`

Runs the full 5-agent pipeline. `hub_id` is optional — auto-derived from `area_id`.

```json
// Request
{
  "area_id": 91,
  "parcel_value": 1500,
  "weight": 1.0,
  "sla_days": 3
}

// Response
{
  "type": "4PL",
  "partner": "Pathao",
  "partner_id": 11,
  "backup_partner": "Steadfast",
  "backup_partner_id": 14,
  "expected_margin": 57.43,
  "risk_score": 28,
  "confidence": 74,
  "dispatch_reason": "Pathao offers the lowest all-in charge for this ISD zone at BDT 55/kg with a LOW SLA risk of 28%.",
  "summary": "Dispatch Decision Report | Hub 2 | Area 91 ..."
}
```

> ⏱️ Expect 15–30 seconds — calls Claude 5 times sequentially.

---

### `GET /api/v1/hubs/summary`

Fleet-wide hub health analysis. Analyzes all hubs using pre-aggregated contribution margin data. Returns per-hub recommendations with specific area-level partner assignment suggestions.

```json
{
  "generated_at": "2026-02-23T10:00:00Z",
  "total_hubs": 137,
  "losing_hubs": 15,
  "hubs": [
    {
      "hub_id": 60,
      "hub_name": "Rangamati Hub",
      "recommendation": "shift_to_3pl",
      "priority": "high",
      "recommended_action": "4PL costs exceed revenue by 56%. Revert OSD areas to Shopup Internal.",
      "estimated_margin_improvement_90d": 124380,
      "is_losing_money": true,
      "avg_monthly_margin": -41460,
      "projected_margin_90d": -124380,
      "total_areas": 11,
      "fourpl_areas": 11,
      "thrpl_areas": 0,
      "unassigned_areas": 0,
      "suggested_assignments": [
        {
          "area_id": 210,
          "area_name": "Barkal (Rangamati)",
          "current_partner_id": 14,
          "current_partner_name": "Steadfast",
          "recommended_partner_id": 3,
          "recommended_partner_name": "Shopup Internal",
          "reason": "Revert to 3PL — evaluate if internal routing reduces cost"
        }
      ]
    }
  ]
}
```

> ⏱️ Expect ~10 seconds — single Claude call across all hubs.

---

### `POST /api/v1/hubs/assign-partners`

Writes area-to-partner assignments directly to `sl_area_partners`.

```json
// Request
{ "assignments": [{ "area_id": 91, "partner_id": 11 }, { "area_id": 2, "partner_id": 3 }] }

// Response
[
  { "area_id": 91, "partner_id": 11, "partner_name": "Pathao", "status": "assigned" },
  { "area_id": 2,  "partner_id": 3,  "partner_name": "Shopup Internal", "status": "assigned" }
]
```

---

### `GET /api/v1/hubs/:hubId/profitability`

Runs Volume Forecast + Cost Modeling + Network Strategy agents.

```json
{
  "hub_id": 2,
  "recommendation": "keep",
  "projected_margin_90d": 145200,
  "risk_score": 32
}
```

---

### `GET /api/v1/hubs/:hubId/model-advice`

Compares 3PL-only vs 4PL-only vs Hybrid operating models.

```json
{
  "hub_id": 2,
  "recommended_model": "Hybrid",
  "margin_3pl_90d": 112000,
  "margin_4pl_90d": 98000,
  "margin_hybrid_90d": 145200,
  "risk_score": 32,
  "confidence": 78,
  "projected_profitability_90d": 145200
}
```

---

### `GET /api/v1/hubs/:hubId/costs?year=&month=`
### `POST /api/v1/hubs/:hubId/costs`

Fetch or upsert monthly fixed costs (rent, employees, utilities, maintenance, other).

```json
// POST body
{
  "year": 2026, "month": 2,
  "rent": 80000, "employee_cost": 150000,
  "utility_cost": 15000, "maintenance_cost": 10000, "other_cost": 5000
}
```

---

### `GET /api/v1/dispatch/history`

Returns the last 50 dispatch decisions from in-memory store (resets on restart).

### `GET /api/v1/hubs` · `GET /api/v1/areas`

Hub and area lists for UI dropdowns.

### `GET /health`

Returns `{ status: "ok" }` — used by the frontend health indicator.

---

## 🗄️ Database Design

### Aggregation Tables (local/Railway, populated by `npm run db:aggregate`)

| Table | Purpose |
|-------|---------|
| `dm_hub_daily_volume` | Pre-aggregated parcel counts per hub per day (last 90 days) |
| `dm_partner_sla_performance` | Breach rate per partner/area/month (last 6 months) |
| `dm_hub_contribution_margin` | Revenue, 4PL cost, fixed cost, margin per hub/month |
| `dm_hub_monthly_costs` | Manual cost inputs: rent, salaries, utilities |

### Key Source Tables (from `stage1_shopuplite`)

| Table | Purpose |
|-------|---------|
| `sl_parcels` | Parcel records (last 90 days) — revenue and status |
| `sl_area_partners` | Maps delivery areas to courier partners |
| `sl_fourpl_partner_pricing` | Zone-aware, weight-tier pricing per 4PL partner |
| `sl_area_hub` | Hub ↔ area mapping (active/inactive) |
| `sl_hubs` / `sl_hub_configs` | Hub metadata and SLA targets |

**Zone mapping:** `sl_areas.ZONE_ID` → 1 = ISD (Dhaka City), 2 = SUB (Suburbs), 7+ = OSD (Outside Dhaka)

**3PL vs 4PL:** `sl_delivery_partners.ID = 3` is Shopup Internal (3PL, zero external cost). All other partner IDs are external 4PL couriers (Pathao = 11, Steadfast = 14).

**Revenue formula:**
- Delivered: `SHOPUP_CHARGE + SHOPUP_COD_CHARGE`
- Returned: `SHOPUP_RETURN_CHARGE`

---

## 🛠️ Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with nodemon auto-reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |
| `npm run db:up` | Start local Docker MySQL (port 3307) |
| `npm run db:down` | Stop Docker MySQL |
| `npm run db:sync` | Copy data from stage1_shopuplite → local DB |
| `npm run db:aggregate` | Refresh all `dm_*` aggregation tables |
| `npm run db:seed-demo` | Seed demo hub cost data |
| `npm run db:seed:partners` | Seed partner delivery history |
| `npm run db:fix-dual-partners` | Deactivate conflicting partner assignments per area |
| `npm run db:redistribute` | Bulk-redistribute areas across Pathao / Steadfast / 3PL |

---

## 🧪 Demo Scenarios

**Recommended flow using the live API:**

```bash
BASE=https://dispatch-mind-ai-beta.vercel.app

# 1. Health check
curl $BASE/health

# 2. Fleet hub health (AI analyzes all hubs, ~10s)
curl $BASE/api/v1/hubs/summary

# 3. AI dispatch decision — area 91 (Tejgaon), 1kg, BDT 1500
curl -X POST $BASE/api/v1/dispatch/recommend \
  -H "Content-Type: application/json" \
  -d '{"area_id":91,"parcel_value":1500,"weight":1,"sla_days":3}'

# 4. Hub profitability — Kalabagan Hub (ID 2)
curl $BASE/api/v1/hubs/2/profitability

# 5. Operating model comparison
curl $BASE/api/v1/hubs/2/model-advice

# 6. Dispatch history
curl $BASE/api/v1/dispatch/history
```

**High-data areas for realistic results:**
- Area **91** — Tejgaon Industrial (ISD, Dhaka)
- Area **2** — Kalabagan/Dhanmondi (ISD, Dhaka)
- Area **1** — Comilla (OSD — higher charges)

---

<div align="center">

**Built for the RedX Hackathon · February 2026**

*Powered by [Claude Sonnet 4.6](https://anthropic.com) · [RedX](https://redx.com.bd)*

</div>
