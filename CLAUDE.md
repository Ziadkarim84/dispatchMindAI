# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DispatchMindAI** is an AI-driven autonomous dispatch optimization engine for RedX logistics (Bangladesh). It uses the Claude API (`claude-sonnet-4-6`) to make 3PL/4PL routing decisions, partner selection, and hub profitability predictions by running a pipeline of 6 AI agents against a MySQL database.

## Commands

```bash
npm run dev           # Start dev server with nodemon auto-reload (port 3000)
npm run build         # Compile TypeScript to dist/
npm start             # Run compiled output
npm run db:up         # Start local Docker MySQL (port 3307, DB: dispatch_mind_ai)
npm run db:down       # Stop Docker MySQL
npm run db:sync       # Copy data from stage1_shopuplite → local dispatch_mind_ai
npm run db:aggregate  # Populate/refresh the 3 aggregation tables
```

## Database Architecture

Two databases in use:

| Database | Purpose | Connection |
|----------|---------|------------|
| `dispatch_mind_ai` | Local Docker MySQL (port 3307) — full read/write | `DB_*` env vars |
| `stage1_shopuplite` | Production source (Teleport proxy port 50229) — read-only | `STAGE_DB_*` env vars |

### Source Tables (from stage1_shopuplite, synced locally)
- `sl_parcels` — parcel records (last 90 days). Revenue = `SHOPUP_CHARGE + SHOPUP_COD_CHARGE` (delivered) or `SHOPUP_RETURN_CHARGE` (returned)
- `sl_logistics_parcel_routes` — hub routing. Use `HUB_ROLE = 'delivery'` to find delivery hub
- `sl_parcel_logs` — delivery timestamps for SLA measurement
- `sl_hubs` / `sl_hub_configs` — hub metadata, `SLA_TARGET` days
- `sl_areas` / `sl_zones` — geography
- `sl_area_hub` — hub↔area mapping (active/inactive). 5,686 rows
- `sl_delivery_partners` / `sl_area_partners` — partner catalogue and area coverage
- `sl_fourpl_parcels` / `sl_fourpl_payments` — 4PL cost data. Use `FOURPL_DELIVERY_CHARGE` column
- Delivered statuses: `'delivered','cash-received','delivery-payment-collected','delivery-payment-sent','hub-payment-collected'`
- Return status: `'shopup_returned'`
- 3PL = `PARTNER_ID IS NULL` (Shopup internal); 4PL = `PARTNER_ID IS NOT NULL`

### Local-only Tables (dispatch_mind_ai)
- `dm_hub_monthly_costs` — monthly fixed costs per hub (rent, employee, utility, maintenance, other). Upsert via `POST /api/v1/hubs/:hubId/costs`
- `dm_hub_daily_volume` — pre-aggregated daily parcel counts per hub (last 90 days)
- `dm_partner_sla_performance` — breach rate per partner/area/month (last 6 months)
- `dm_hub_contribution_margin` — revenue/4PL cost/fixed cost/margin per hub/month (last 6 months)

Run `npm run db:aggregate` to refresh aggregation tables from live data.

## AI Agent Pipeline

Six agents run sequentially for the dispatch decision:

```
Volume Forecast → Cost Modeling → SLA Risk → Partner Evaluation → Executive Summary
                                                     ↓
                                          Network Strategy (hub endpoints only)
```

| Agent | File | Input | Output |
|-------|------|-------|--------|
| Volume Forecast | `volume-forecast.agent.ts` | hub_id | predicted daily avg, 90d total, trend |
| Cost Modeling | `cost-modeling.agent.ts` | hub_id, volume forecast | 3PL/4PL/Hybrid margin per parcel |
| SLA Risk | `sla-risk.agent.ts` | area_id | breach probability + risk score per partner |
| Partner Evaluation | `partner-evaluation.agent.ts` | area_id, SLA risks, cost models | optimal partner, confidence, backup |
| Network Strategy | `network-strategy.agent.ts` | hub_id, volume, costs | keep/close/convert + 90d margin |
| Executive Summary | `executive-summary.agent.ts` | all agent outputs | plain-English decision report |

All agents use `runPrompt(system, user)` from `base.agent.ts`. JSON responses are extracted with `parseClaudeJson<T>()` which scans for the first `{`/`[` to handle any Claude preamble text.

## API Endpoints

All routes under `/api/v1`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/dispatch/recommend` | Full 5-agent dispatch pipeline (~20s) |
| GET | `/dispatch/history` | Last 50 decisions (in-memory, resets on restart) |
| GET | `/partners/optimize?area_id=&hub_id=` | SLA Risk + Partner Evaluation agents |
| GET | `/hubs/:hubId/profitability` | Volume + Cost + Network Strategy agents |
| GET | `/hubs/:hubId/model-advice` | 3PL vs 4PL vs Hybrid comparison |
| GET | `/hubs/:hubId/costs?year=&month=` | Fetch hub monthly cost breakdown |
| POST | `/hubs/:hubId/costs` | Upsert hub monthly cost entry |

## Architecture

### Layer Structure
- **`src/agents/`** — AI agents (one file per agent + `base.agent.ts`)
- **`src/modules/`** — Feature modules: `dispatch/`, `partners/`, `hubs/` (controller → service → agents)
- **`src/database/`** — `connection.ts` (MySQL pool), `sync.ts` (stage→local copy), `aggregate.ts` (aggregation refresh), `migrations/`
- **`src/common/`** — Middleware, error classes (`BaseError` → `ValidationError`/`NotFoundError`), Winston logger, response formatter
- **`src/config/`** — Zod env validation, app config, DB config

### TypeScript Path Aliases
```
@common/*   → src/common/*
@config/*   → src/config/*
@database/* → src/database/*
@modules/*  → src/modules/*
@agents/*   → src/agents/*
```

### API Response Format
```json
{ "success": true, "data": {}, "meta": { "timestamp": "...", "requestId": "uuid" } }
{ "success": false, "error": { "code": "...", "message": "..." }, "meta": { "timestamp": "...", "requestId": "uuid" } }
```

### Dispatch Decision Logic
Use 4PL if: `margin_delta_vs_current > 0 AND sla_risk_score < 60 AND optimal_partner_id !== 0`, otherwise 3PL (Shopup Internal).

Hub-area combinations are validated against `sl_area_hub` before running agents (warning only, non-blocking).
