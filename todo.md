# DispatchMindAI — Task Tracker

Legend: `[ ]` pending · `[x]` done · `[-]` skipped

> **DB**: `stage1_shopuplite` (existing tables, no redesign needed)
> **Margin formula**: `SHOPUP_CHARGE + COD_CHARGE + RETURN_CHARGE − PARTNER_CHARGE − SUBSIDY_AMOUNT`

---

## Phase 1: Environment Setup

- [x] **1.1** Copy `.env.example` → `.env`, set `DB_HOST/USER/PASSWORD`, `DB_NAME=stage1_shopuplite`, `ANTHROPIC_API_KEY`, `JWT_SECRET`
- [x] **1.2** Verify DB connectivity (`npm run dev` should start without crash)

---

## Phase 2: File Structure Changes

New directories to create under `src/` (referenced in `tsconfig.json` paths but not yet created):

```
src/
├── agents/                            ← NEW
│   ├── base.agent.ts                  (Claude API wrapper)
│   ├── volume-forecast.agent.ts
│   ├── cost-modeling.agent.ts
│   ├── sla-risk.agent.ts
│   ├── partner-evaluation.agent.ts
│   ├── network-strategy.agent.ts
│   └── executive-summary.agent.ts
├── modules/                           ← NEW
│   ├── dispatch/
│   │   ├── dispatch.controller.ts
│   │   ├── dispatch.service.ts
│   │   ├── dispatch.routes.ts
│   │   └── dispatch.schema.ts
│   ├── partners/
│   │   ├── partners.controller.ts
│   │   ├── partners.service.ts
│   │   ├── partners.routes.ts
│   │   └── partners.schema.ts
│   └── hubs/
│       ├── hubs.controller.ts
│       ├── hubs.service.ts
│       ├── hubs.routes.ts
│       └── hubs.schema.ts
└── common/
    └── types/                         ← NEW
        └── index.ts
```

- [x] **2.1** Create `src/common/types/index.ts` — shared TypeScript interfaces
- [x] **2.2** Create `src/agents/` directory with stub files for all 7 files
- [x] **2.3** Create `src/modules/dispatch/`, `src/modules/partners/`, `src/modules/hubs/` with stub files
- [x] **2.4** Wire module routes into `src/app.ts` under `/api/v1`

---

## Phase 3: Shared Types & Base Agent

- [ ] **3.1** Define shared types in `src/common/types/index.ts`:
  - `Hub` (from `sl_hubs`: ID, HUB_NAME, HUB_TYPE, IS_MH, IS_RMH, SLA_TIER, SLA_TARGET)
  - `Partner` (from `sl_delivery_partners`: ID, NAME, TYPE)
  - `PartnerZone` (from `sl_partner_zones`: PARTNER_ID, ZONE_ID, STATUS)
  - `DispatchDecision`, `PartnerRanking`, `HubProfitability`, `HubModelRecommendation`
  - `AgentResult<T>` — standard wrapper for all agent outputs `{ data: T, reasoning: string, confidence: number }`

- [ ] **3.2** Implement `src/agents/base.agent.ts`:
  - Wraps Anthropic SDK with `runPrompt(systemPrompt: string, userPrompt: string): Promise<string>`
  - Uses `claude-sonnet-4-6` model
  - Handles API errors gracefully

---

## Phase 4: AI Agents

### Agent 1 — Volume Forecast (`src/agents/volume-forecast.agent.ts`)
**Source tables**: `sl_parcels` (DESTINATION_HUB_ID, STATUS, created_at), `sl_hubs`

- [ ] **4.1** Query: daily parcel count per hub for last 90 days from `sl_parcels` grouped by `DESTINATION_HUB_ID` and `DATE(created_at)`
- [ ] **4.2** Send historical volume series to Claude → return predicted daily volume per hub for next 90 days + trend signal (growing/shrinking/stable)

### Agent 2 — Cost Modeling (`src/agents/cost-modeling.agent.ts`)
**Source tables**: `sl_logistics_finance_reports`, `sl_parcels`, `sl_logistics_shop_category_pricing_default`

- [ ] **4.3** Query: avg `SHOPUP_CHARGE`, `PARTNER_CHARGE`, `SUBSIDY_AMOUNT`, `SHOPUP_COD_CHARGE`, `SHOPUP_RETURN_CHARGE` per hub per partner from `sl_logistics_finance_reports`
- [ ] **4.4** Send cost breakdown to Claude → return contribution margin per parcel for 3PL-only, 4PL-only, and Hybrid scenarios

### Agent 3 — SLA Risk (`src/agents/sla-risk.agent.ts`)
**Source tables**: `sl_logistics_issue`, `sl_logistics_issue_sla_trackings`, `sl_logistics_hub_tats`, `sl_parcels`

- [ ] **4.5** Query: breach count and total issues per `RESPONSIBLE_DELIVERY_PARTNER_ID` per zone from `sl_logistics_issue` joined with `sl_logistics_issue_sla_trackings` (where `CLOSED_AT IS NULL` = breached)
- [ ] **4.6** Query: hub TAT compliance from `sl_logistics_hub_tats` per hub pair
- [ ] **4.7** Send SLA history to Claude → return breach probability (0–100) and risk score per partner per zone

### Agent 4 — Partner Evaluation (`src/agents/partner-evaluation.agent.ts`)
**Source tables**: `sl_delivery_partners`, `sl_partner_zones`, `4pl_manual_script_logs`

- [ ] **4.8** Query: available partners for a zone from `sl_partner_zones` joined with `sl_delivery_partners`
- [ ] **4.9** Query: 4PL (Steadfast) settlement rate and sync failures from `4pl_manual_script_logs` (FOURPL_SETTLEMENT, FOURPL_LOG_STATUS)
- [ ] **4.10** Feed SLA risk scores (Agent 3) + cost data (Agent 2) + partner availability to Claude → return ranked partners with optimal choice, confidence score, and backup partner

### Agent 5 — Network Strategy (`src/agents/network-strategy.agent.ts`)
**Source tables**: `sl_hubs`, `sl_hub_configs`, `sl_area_hub`, `sl_logistics_finance_reports`

- [ ] **4.11** Query: per-hub aggregates — total parcel volume, avg margin, partner dependency ratio (parcels with PARTNER_ID ≠ 3 / total parcels) from `sl_parcels` + `sl_logistics_finance_reports`
- [ ] **4.12** Query: hub cost structure from `sl_hubs` (SLA_TIER, IS_MH, IS_RMH) and `sl_hub_configs` (operation flags)
- [ ] **4.13** Feed volume forecast (Agent 1) + margin (Agent 2) + hub config to Claude → return `open/close/convert` recommendation + 90-day profitability projection

### Agent 6 — Executive Summary (`src/agents/executive-summary.agent.ts`)

- [ ] **4.14** Accept outputs from Agents 1–5 as input
- [ ] **4.15** Claude generates a concise human-readable decision report (dispatch choice, reasoning, margin impact, risk level, recommended action) for operations managers

---

## Phase 5: Feature Modules

### Feature 1 — Dispatch Decision
**Endpoint**: `POST /api/v1/dispatch/recommend`

- [ ] **5.1** `dispatch.schema.ts` — Zod: validate `{ hub_id, area_id, parcel_value, weight, sla_days }`
- [ ] **5.2** `dispatch.service.ts` — orchestrate Agents 1→2→3→4→6 in sequence; final decision = 3PL or 4PL + which partner
- [ ] **5.3** `dispatch.controller.ts` + `dispatch.routes.ts`
- [ ] **5.4** Response:
  ```json
  { "type": "3PL|4PL", "partner": "Steadfast|Pathao|RedX", "expected_margin": 0.0,
    "risk_score": 0, "confidence": 0, "summary": "..." }
  ```

### Feature 2 — Partner Optimizer
**Endpoint**: `GET /api/v1/partners/optimize?zone_id=&hub_id=`

- [ ] **5.5** `partners.service.ts` — run Agent 3 + Agent 4 for a given zone
- [ ] **5.6** `partners.controller.ts` + `partners.routes.ts`
- [ ] **5.7** Response:
  ```json
  { "optimal_partner": "...", "confidence": 0, "backup_partner": "...", "sla_risk_score": 0 }
  ```

### Feature 3 — Hub Profitability Predictor
**Endpoint**: `GET /api/v1/hubs/:hubId/profitability`

- [ ] **5.8** `hubs.service.ts` — run Agent 1 + Agent 2 + Agent 5 for a hub
- [ ] **5.9** `hubs.controller.ts` + `hubs.routes.ts`
- [ ] **5.10** Response:
  ```json
  { "recommendation": "open|close|convert", "projected_margin_90d": 0.0, "risk_score": 0 }
  ```

### Feature 4 — Hub Model Optimization Advisor
**Endpoint**: `GET /api/v1/hubs/:hubId/model-advice`

- [ ] **5.11** Extend `hubs.service.ts` — compare 3PL-only vs 4PL-only vs Hybrid via Agent 5
- [ ] **5.12** Add route in `hubs.routes.ts`
- [ ] **5.13** Response:
  ```json
  { "recommended_model": "3PL|4PL|Hybrid", "margin_uplift": 0.0,
    "risk_score": 0, "confidence": 0, "projected_profitability_90d": 0.0 }
  ```

---

## Phase 6: Aggregation Tables (Only if live queries are too slow)

> Create only if query performance on live tables is unacceptable for the demo.

- [ ] **6.1** `dm_hub_daily_volume` — pre-aggregated daily parcel counts per hub (sourced from `sl_parcels`)
- [ ] **6.2** `dm_partner_sla_performance` — breach rate per partner per zone per month (sourced from `sl_logistics_issue` + `sl_logistics_issue_sla_trackings`)
- [ ] **6.3** `dm_hub_contribution_margin` — avg margin per hub per month (sourced from `sl_logistics_finance_reports`)

---

## Phase 7: Polish & Demo Readiness

- [ ] **7.1** Add Zod validation middleware wired to all routes
- [ ] **7.2** `GET /api/v1/dispatch/history` — list recent decisions (in-memory or a new `dispatch_decisions` table)
- [ ] **7.3** Create `requests.http` (REST Client) or Postman collection for demo scenarios
- [ ] **7.4** Update `CLAUDE.md` with final module/agent structure and table references
- [ ] **7.5** End-to-end demo test: parcel in → dispatch decision → executive summary out
