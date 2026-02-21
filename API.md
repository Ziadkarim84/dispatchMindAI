# DispatchMindAI — API Documentation

**Base URL:** `http://localhost:3000`
**API Prefix:** `/api/v1`
**Content-Type:** `application/json`

---

## Response Format

All endpoints return a unified response envelope:

**Success**
```json
{
  "success": true,
  "data": { },
  "meta": {
    "timestamp": "2026-02-21T03:00:00.000Z",
    "requestId": "uuid-v4"
  }
}
```

**Error**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": { }
  },
  "meta": {
    "timestamp": "2026-02-21T03:00:00.000Z",
    "requestId": "uuid-v4"
  }
}
```

---

## Health

### `GET /health`

Verify the server is running.

**Response**
```json
{
  "status": "ok",
  "timestamp": "2026-02-21T03:00:00.000Z"
}
```

---

## Dispatch

### `POST /api/v1/dispatch/recommend`

**Core endpoint.** Runs the full 5-agent AI pipeline and returns a 3PL/4PL dispatch decision with an executive summary.

> ⏱️ Expect **15–30 seconds** — this calls Claude Sonnet 4.6 multiple times sequentially.

**Agent execution order:**
1. Volume Forecast → predicts hub demand
2. Cost Modeling → calculates 3PL/4PL/Hybrid margins
3. SLA Risk → assesses partner breach probability
4. Partner Evaluation → ranks and selects optimal partner
5. Executive Summary → generates plain-English decision report

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hub_id` | `integer` | ✅ | Hub ID from `sl_hubs` |
| `area_id` | `integer` | ✅ | Delivery area ID from `sl_areas` |
| `parcel_value` | `number` | ✅ | Declared value of parcel in BDT |
| `weight` | `number` | ✅ | Parcel weight in kg |
| `sla_days` | `integer` | ❌ | SLA target days (default: `3`) |

```json
{
  "hub_id": 129,
  "area_id": 1748,
  "parcel_value": 1500,
  "weight": 1.2,
  "sla_days": 3
}
```

**Response `data`**

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"3PL" \| "4PL"` | Recommended dispatch type |
| `partner` | `string` | Recommended delivery partner name |
| `expected_margin` | `number` | Projected margin per parcel in BDT |
| `risk_score` | `number` | SLA risk score (0–100, lower is better) |
| `confidence` | `number` | AI confidence in recommendation (0–100) |
| `summary` | `string` | Plain-English executive summary report |

```json
{
  "success": true,
  "data": {
    "type": "3PL",
    "partner": "Shopup (Internal)",
    "expected_margin": -783.59,
    "risk_score": 78,
    "confidence": 42,
    "summary": "Dispatch Decision Report | Hub 129 | Area 1748\n\nRecommendation: 3PL via Shopup (Internal)\n\nThis recommendation carries low confidence at 42%..."
  },
  "meta": {
    "timestamp": "2026-02-21T03:14:52.000Z",
    "requestId": "b96cdbc3-d454-479c-9d7a-8ac1d82c2023"
  }
}
```

**Decision Logic:**
The system recommends **4PL** (external partner) only when all three conditions are met:
- 4PL margin delta vs current > 0 (cost-positive)
- SLA risk score < 60 (acceptable reliability)
- A real external partner is available for the area

Otherwise, it defaults to **3PL** (Shopup Internal).

**Error Responses**

| Status | Code | Cause |
|--------|------|-------|
| `400` | `VALIDATION_ERROR` | Missing or invalid fields |
| `500` | `INTERNAL_SERVER_ERROR` | Agent or DB failure |

---

### `GET /api/v1/dispatch/history`

Returns the last 50 dispatch decisions made in the current server session. **Resets on server restart** (in-memory store).

**Response `data`** — Array of dispatch decision objects, most recent first:

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"3PL" \| "4PL"` | Dispatch type |
| `partner` | `string` | Partner name |
| `expected_margin` | `number` | Margin per parcel in BDT |
| `risk_score` | `number` | SLA risk score (0–100) |
| `confidence` | `number` | AI confidence (0–100) |
| `summary` | `string` | Executive summary |
| `hub_id` | `integer` | Hub ID |
| `area_id` | `integer` | Area ID |
| `decided_at` | `string` | ISO 8601 timestamp |

```json
{
  "success": true,
  "data": [
    {
      "type": "3PL",
      "partner": "Shopup (Internal)",
      "expected_margin": -783.59,
      "risk_score": 78,
      "confidence": 42,
      "summary": "...",
      "hub_id": 129,
      "area_id": 1748,
      "decided_at": "2026-02-21T03:16:31.784Z"
    }
  ],
  "meta": {
    "timestamp": "2026-02-21T03:17:32.000Z",
    "requestId": "ddac6126-d0ac-4b01-80ea-b8854c976eb7"
  }
}
```

---

## Partners

### `GET /api/v1/partners/optimize`

Runs **SLA Risk** + **Partner Evaluation** agents for a given area and hub. Returns the optimal delivery partner with a confidence score and backup option.

> ⏱️ Expect **10–20 seconds**.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `area_id` | `integer` | ✅ | Delivery area ID |

The hub is derived automatically from `sl_area_hub` using the `area_id`.

```
GET /api/v1/partners/optimize?area_id=1748
```

**Response `data`**

| Field | Type | Description |
|-------|------|-------------|
| `optimal_partner_id` | `integer` | Partner ID (`0` = Shopup Internal) |
| `optimal_partner_name` | `string` | Name of optimal partner |
| `confidence` | `number` | AI confidence score (0–100) |
| `backup_partner_id` | `integer \| null` | Backup partner ID |
| `backup_partner_name` | `string \| null` | Backup partner name |
| `sla_risk_score` | `number` | Composite SLA risk score (0–100) |

```json
{
  "success": true,
  "data": {
    "optimal_partner_id": 0,
    "optimal_partner_name": "Shopup (Internal)",
    "confidence": 62,
    "backup_partner_id": 8,
    "backup_partner_name": "Paper Fly",
    "sla_risk_score": 50
  },
  "meta": {
    "timestamp": "2026-02-21T03:04:48.000Z",
    "requestId": "70dfbe3c-9af5-4dc9-8a8e-89f61817399c"
  }
}
```

**Error Responses**

| Status | Code | Cause |
|--------|------|-------|
| `400` | `VALIDATION_ERROR` | Missing or non-integer `area_id` / `hub_id` |
| `500` | `INTERNAL_SERVER_ERROR` | Agent or DB failure |

---

## Hubs

### `GET /api/v1/hubs/:hubId/profitability`

Runs **Volume Forecast** + **Cost Modeling** + **Network Strategy** agents. Returns whether the hub should be kept open, closed, or converted to 4PL-only, along with a 90-day margin projection.

> ⏱️ Expect **10–20 seconds**.

**Path Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `hubId` | `integer` | ✅ | Hub ID from `sl_hubs` |

```
GET /api/v1/hubs/129/profitability
```

**Response `data`**

| Field | Type | Description |
|-------|------|-------------|
| `hub_id` | `integer` | Hub ID |
| `recommendation` | `"keep" \| "close" \| "convert"` | AI recommendation |
| `projected_margin_90d` | `number` | Projected 90-day total margin in BDT |
| `risk_score` | `number` | Operational risk score (0–100) |

```json
{
  "success": true,
  "data": {
    "hub_id": 129,
    "recommendation": "close",
    "projected_margin_90d": -918600,
    "risk_score": 87
  },
  "meta": {
    "timestamp": "2026-02-21T03:13:43.000Z",
    "requestId": "61097e75-329f-4e2c-b352-713c25f6554e"
  }
}
```

**Recommendation meanings:**

| Value | Meaning |
|-------|---------|
| `keep` | Hub is profitable — continue 3PL operations |
| `close` | Hub is loss-making — consider shutting down |
| `convert` | Switch to 4PL-only to reduce fixed costs |

---

### `GET /api/v1/hubs/:hubId/model-advice`

Compares **3PL-only vs 4PL-only vs Hybrid** operating models for the hub. Returns the recommended model with margin uplift and 90-day profitability projection.

> ⏱️ Expect **10–20 seconds**.

**Path Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `hubId` | `integer` | ✅ | Hub ID from `sl_hubs` |

```
GET /api/v1/hubs/129/model-advice
```

**Response `data`**

| Field | Type | Description |
|-------|------|-------------|
| `hub_id` | `integer` | Hub ID |
| `recommended_model` | `"3PL" \| "4PL" \| "Hybrid"` | Optimal operating model |
| `margin_uplift` | `number` | Margin improvement per parcel vs current (BDT) |
| `risk_score` | `number` | Operational risk score (0–100) |
| `confidence` | `number` | AI confidence (0–100) |
| `projected_profitability_90d` | `number` | Projected 90-day profitability in BDT |

```json
{
  "success": true,
  "data": {
    "hub_id": 129,
    "recommended_model": "3PL",
    "margin_uplift": 0,
    "risk_score": 85,
    "confidence": 55,
    "projected_profitability_90d": -916797
  },
  "meta": {
    "timestamp": "2026-02-21T03:13:59.000Z",
    "requestId": "dbc766ff-9503-4a8b-80a5-302a9cd848ec"
  }
}
```

---

### `GET /api/v1/hubs/:hubId/costs`

Fetch the monthly cost breakdown for a hub. Optionally filter by year and/or month.

**Path Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `hubId` | `integer` | ✅ | Hub ID |

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `year` | `integer` | ❌ | Filter by year (e.g. `2026`) |
| `month` | `integer` | ❌ | Filter by month `1–12` |

```
GET /api/v1/hubs/129/costs?year=2026&month=2
```

**Response `data`** — Array of cost records:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `integer` | Record ID |
| `hub_id` | `integer` | Hub ID |
| `year` | `integer` | Year |
| `month` | `integer` | Month (1–12) |
| `rent` | `number` | Monthly rent in BDT |
| `employee_cost` | `number` | Employee cost in BDT |
| `utility_cost` | `number` | Utilities cost in BDT |
| `maintenance_cost` | `number` | Maintenance cost in BDT |
| `other_cost` | `number` | Miscellaneous costs in BDT |
| `notes` | `string \| null` | Optional notes |
| `created_at` | `string` | ISO 8601 creation timestamp |
| `updated_at` | `string` | ISO 8601 last update timestamp |

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "hub_id": 129,
      "year": 2026,
      "month": 2,
      "rent": 80000,
      "employee_cost": 150000,
      "utility_cost": 15000,
      "maintenance_cost": 10000,
      "other_cost": 5000,
      "notes": "Feb 2026 costs — hub 129",
      "created_at": "2026-02-21T00:00:00.000Z",
      "updated_at": "2026-02-21T00:00:00.000Z"
    }
  ],
  "meta": {
    "timestamp": "2026-02-21T03:00:00.000Z",
    "requestId": "uuid"
  }
}
```

---

### `POST /api/v1/hubs/:hubId/costs`

Upsert (insert or update) the monthly operational costs for a hub. Safe to call multiple times for the same hub/year/month combination. This data feeds the **Cost Modeling** and **Network Strategy** agents.

**Path Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `hubId` | `integer` | ✅ | Hub ID |

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `year` | `integer` | ✅ | Year (≥ 2020) |
| `month` | `integer` | ✅ | Month `1–12` |
| `rent` | `number` | ❌ | Monthly rent in BDT (default: `0`) |
| `employee_cost` | `number` | ❌ | Employee cost in BDT (default: `0`) |
| `utility_cost` | `number` | ❌ | Utilities in BDT (default: `0`) |
| `maintenance_cost` | `number` | ❌ | Maintenance in BDT (default: `0`) |
| `other_cost` | `number` | ❌ | Other costs in BDT (default: `0`) |
| `notes` | `string` | ❌ | Optional description |

```json
{
  "year": 2026,
  "month": 2,
  "rent": 80000,
  "employee_cost": 150000,
  "utility_cost": 15000,
  "maintenance_cost": 10000,
  "other_cost": 5000,
  "notes": "Feb 2026 costs — hub 129"
}
```

**Response `data`**

```json
{
  "success": true,
  "data": {
    "hub_id": 129,
    "year": 2026,
    "month": 2,
    "rent": 80000,
    "employee_cost": 150000,
    "utility_cost": 15000,
    "maintenance_cost": 10000,
    "other_cost": 5000,
    "notes": "Feb 2026 costs — hub 129"
  },
  "meta": {
    "timestamp": "2026-02-21T03:00:00.000Z",
    "requestId": "uuid"
  }
}
```

**Error Responses**

| Status | Code | Cause |
|--------|------|-------|
| `400` | `VALIDATION_ERROR` | Invalid year/month or negative cost values |
| `500` | `INTERNAL_SERVER_ERROR` | DB failure |

---

## Error Reference

| HTTP Status | Code | Description |
|-------------|------|-------------|
| `400` | `VALIDATION_ERROR` | Request body or query params failed Zod validation |
| `404` | `NOT_FOUND` | Route does not exist |
| `500` | `INTERNAL_SERVER_ERROR` | Unhandled server error (DB failure, Claude API error, JSON parse error) |

---

## High-Volume Hub/Area Combos (for testing)

Use these real data combinations for best results:

| hub_id | area_id | Parcel count (90d) |
|--------|---------|-------------------|
| `129` | `1748` | 1,022 |
| `136` | `1245` | 652 |
| `1` | `103` | 246 |
| `15` | `1005` | 173 |
| `2` | `87` | 116 |
