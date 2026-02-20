# DispatchMindAI — Task Tracker

Legend: `[ ]` pending · `[x]` done · `[-]` skipped

> **DB**: `stage1_shopuplite` (existing tables + `dm_hub_monthly_costs` new table)
> **Revenue formula**: `SHOPUP_CHARGE + SHOPUP_COD_CHARGE` (delivered) or `SHOPUP_RETURN_CHARGE` (returned) — gated by `sl_parcels.STATUS`
> **3PL vs 4PL**: identified by `sl_parcels.PARTNER_ID` → null/Shopup = 3PL, Steadfast/Pathao = 4PL

---

## Phase 1: Environment Setup

- [x] **1.1** Copy `.env.example` → `.env`, set `DB_HOST/USER/PASSWORD`, `DB_NAME=stage1_shopuplite`, `ANTHROPIC_API_KEY`, `JWT_SECRET`
- [x] **1.2** Verify DB connectivity (`npm run dev` should start without crash)

---

## Phase 2: File Structure Changes

- [x] **2.1** Create `src/common/types/index.ts` — shared TypeScript interfaces
- [x] **2.2** Create `src/agents/` directory with stub files for all 7 files
- [x] **2.3** Create `src/modules/dispatch/`, `src/modules/partners/`, `src/modules/hubs/` with stub files
- [x] **2.4** Wire module routes into `src/app.ts` under `/api/v1`

---

## Phase 3: Database & Shared Foundation

- [x] **3.1** Spin up local Docker MySQL: `npm run db:up` (auto-creates `dispatch_mind_ai` DB + runs `dm_hub_monthly_costs` migration)
- [x] **3.2** Fill `STAGE_DB_*` vars in `.env`, then run `npm run db:sync` to copy data from `stage1_shopuplite`
- [ ] **3.3** Seed `dm_hub_monthly_costs` with initial cost data via `POST /api/v1/hubs/:hubId/costs` (after Phase 5.10–5.12)
- [x] **3.4** Update shared types in `src/common/types/index.ts` to reflect confirmed table/column names
- [x] **3.5** Implement `src/agents/base.agent.ts` — Claude API wrapper with `runPrompt(system, user)` using `claude-sonnet-4-6`

---

## Phase 4: AI Agents

### Agent 1 — Volume Forecast (`src/agents/volume-forecast.agent.ts`)
**Tables**: `sl_parcels` → `sl_logistics_parcel_routes` (HUB_ID where HUB_ROLE = 'delivery')

- [ ] **4.1** Query: daily parcel count per hub for last 90 days
  ```sql
  SELECT r.HUB_ID, DATE(p.created_at) AS date, COUNT(*) AS parcel_count
  FROM sl_parcels p
  JOIN sl_logistics_parcel_routes r ON r.PARCEL_ID = p.ID AND r.HUB_ROLE = 'delivery'
  WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
  GROUP BY r.HUB_ID, DATE(p.created_at)
  ```
- [ ] **4.2** Send historical series to Claude → return predicted daily avg, 90d total, trend (growing/shrinking/stable)

### Agent 2 — Cost Modeling (`src/agents/cost-modeling.agent.ts`)
**Tables**: `sl_parcels`, `sl_fourpl_parcels`, `sl_fourpl_payments`, `dm_hub_monthly_costs`

- [ ] **4.3** Query per-hub revenue: avg `SHOPUP_CHARGE + SHOPUP_COD_CHARGE` (delivered) and `SHOPUP_RETURN_CHARGE` (returned) from `sl_parcels` grouped by hub + `sl_parcels.STATUS`
- [ ] **4.4** Query 4PL cost history: charges per zone type (ISD/SUB/OSD) from `sl_fourpl_parcels` + `sl_fourpl_payments`
- [ ] **4.5** Query hub fixed costs from `dm_hub_monthly_costs` for current month
- [ ] **4.6** Send revenue + 4PL cost + fixed costs to Claude → return contribution margin per scenario (3PL / 4PL / Hybrid)

### Agent 3 — SLA Risk (`src/agents/sla-risk.agent.ts`)
**Tables**: `sl_parcels`, `sl_parcel_logs`, `sl_delivery_partners`, `sl_area_partners`

- [ ] **4.7** Query: per partner per area — total deliveries, late deliveries (delivery timestamp from `sl_parcel_logs` vs SLA target), using `sl_parcels.PARTNER_ID`
- [ ] **4.8** Send SLA history to Claude → return breach probability (0–100) and risk score per partner

### Agent 4 — Partner Evaluation (`src/agents/partner-evaluation.agent.ts`)
**Tables**: `sl_delivery_partners`, `sl_area_partners`, `sl_shop_configs`, `sl_fourpl_parcels`

- [ ] **4.9** Query: available partners for a given area from `sl_area_partners` joined with `sl_delivery_partners`
- [ ] **4.10** Feed SLA risk scores (Agent 3) + cost data (Agent 2) + availability to Claude → return ranked partners: optimal choice, confidence score, backup partner

### Agent 5 — Network Strategy (`src/agents/network-strategy.agent.ts`)
**Tables**: `sl_hubs`, `sl_hub_configs`, `sl_parcels`, `sl_logistics_parcel_routes`, `dm_hub_monthly_costs`

- [ ] **4.11** Query: per-hub — total volume, revenue, 4PL ratio (`PARTNER_ID IS NOT NULL / total`), avg margin
- [ ] **4.12** Query: hub fixed + variable costs from `dm_hub_monthly_costs` + per-parcel charges
- [ ] **4.13** Feed volume forecast + margin + costs to Claude → return open/close/convert recommendation + 90d profitability projection

### Agent 6 — Executive Summary (`src/agents/executive-summary.agent.ts`)

- [ ] **4.14** Accept outputs from Agents 1–5
- [ ] **4.15** Claude generates human-readable decision report for operations managers

---

## Phase 5: Feature Modules

### Feature 1 — Dispatch Decision
**Endpoint**: `POST /api/v1/dispatch/recommend`

- [ ] **5.1** `dispatch.schema.ts` — Zod: validate `{ hub_id, area_id, parcel_value, weight, sla_days }`
- [ ] **5.2** `dispatch.service.ts` — orchestrate Agents 1→2→3→4→6 in sequence
- [ ] **5.3** Response: `{ type, partner, expected_margin, risk_score, confidence, summary }`

### Feature 2 — Partner Optimizer
**Endpoint**: `GET /api/v1/partners/optimize?area_id=&hub_id=`

- [ ] **5.4** `partners.service.ts` — run Agent 3 + Agent 4 for a given area
- [ ] **5.5** Response: `{ optimal_partner, confidence, backup_partner, sla_risk_score }`

### Feature 3 — Hub Profitability Predictor
**Endpoint**: `GET /api/v1/hubs/:hubId/profitability`

- [ ] **5.6** `hubs.service.ts` — run Agents 1 + 2 + 5 for a hub
- [ ] **5.7** Response: `{ recommendation, projected_margin_90d, risk_score }`

### Feature 4 — Hub Model Optimization Advisor
**Endpoint**: `GET /api/v1/hubs/:hubId/model-advice`

- [ ] **5.8** Extend `hubs.service.ts` — compare 3PL-only vs 4PL-only vs Hybrid via Agent 5
- [ ] **5.9** Response: `{ recommended_model, margin_uplift, risk_score, confidence, projected_profitability_90d }`

### Feature 5 — Hub Costs CRUD
**Endpoints**: `POST/GET /api/v1/hubs/:hubId/costs`

- [ ] **5.10** Add `hubs.costs.routes.ts` + controller + service for managing `dm_hub_monthly_costs`
- [ ] **5.11** `GET /api/v1/hubs/:hubId/costs?year=&month=` — fetch cost breakdown for a hub/month
- [ ] **5.12** `POST /api/v1/hubs/:hubId/costs` — upsert monthly cost entry

---

## Phase 6: Aggregation Tables (Only if live queries are too slow)

> Create only if query performance on live tables is unacceptable for the demo.

- [ ] **6.1** `dm_hub_daily_volume` — pre-aggregated daily parcel counts per hub
- [ ] **6.2** `dm_partner_sla_performance` — breach rate per partner per area per month
- [ ] **6.3** `dm_hub_contribution_margin` — avg margin per hub per month

---

## Phase 7: Polish & Demo Readiness

- [ ] **7.1** `GET /api/v1/dispatch/history` — list recent decisions
- [ ] **7.2** Create `requests.http` for demo scenarios (dispatch, partner optimize, hub profitability)
- [ ] **7.3** Update `CLAUDE.md` with final table references and agent flow
- [ ] **7.4** End-to-end demo test: parcel in → dispatch decision → executive summary out
