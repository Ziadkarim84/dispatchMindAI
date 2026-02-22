# Lovable Prompt — DispatchMindAI Frontend

> Paste everything below this line into Lovable as your prompt.

---

Build a full React + Tailwind CSS frontend for **DispatchMindAI** — an AI-driven autonomous dispatch optimization engine for **RedX**, Bangladesh's leading last-mile logistics platform. The app connects to a REST API at `http://localhost:3000` and displays real-time AI agent decisions.

---

## Design Language

- **Theme:** Dark mode only. Deep navy/slate background (`#0a0f1e`, `#0f172a`), not pure black.
- **Accent colors:**
  - AI/active: Electric blue `#3b82f6` with glow effects
  - Success/3PL: Emerald green `#10b981`
  - Warning/medium risk: Amber `#f59e0b`
  - Danger/high risk: Rose red `#f43f5e`
  - 4PL/external: Purple `#8b5cf6`
- **Typography:** Inter or Geist font. Large bold headings. Monospace for numbers and IDs.
- **Cards:** Glassmorphism style — semi-transparent dark cards with subtle border (`border-white/10`), backdrop blur.
- **Animations:**
  - Pulsing glow on active AI agents
  - Typewriter effect for executive summary text
  - Smooth progress bar during API calls
  - Shimmer skeleton loaders while fetching
  - Number counters that animate up/down on result
- **Icons:** Lucide React icons throughout.
- **Vibe:** Bloomberg terminal meets AI startup — data-dense but visually clean.

---

## Pages & Navigation

Sidebar navigation (collapsible) with these pages:

1. **Dashboard** (`/`) — Overview and quick actions
2. **Dispatch** (`/dispatch`) — Submit dispatch request, watch AI agents run
3. **Partners** (`/partners`) — Partner optimizer
4. **Hubs** (`/hubs`) — Hub profitability and model advice
5. **Hub Health** (`/hubs/summary`) — Hub profitability health check, losing hubs, AI partner reassignment
6. **History** (`/history`) — Past dispatch decisions

Sidebar items include an icon, label, and active state highlight.

Header bar: App logo (robot/lightning bolt icon) + "DispatchMindAI" wordmark, current date/time (live clock), and a "API Status" indicator dot (green = connected, red = error) that pings `/health` every 30 seconds.

---

## Page 1: Dashboard (`/`)

A command-center overview.

**Top stats row — 4 metric cards:**
- Total Dispatches Today (from history count)
- Average Margin per Parcel (BDT, from history)
- High Risk Decisions (risk_score > 60, from history)
- AI Confidence Avg (from history)

Each card has: icon, big animated number, label, and a small trend arrow.

**AI Pipeline Visualization (center piece):**
A horizontal flow diagram showing the 6 agents as connected nodes:
```
[Volume Forecast] → [Cost Modeling] → [SLA Risk] → [Partner Eval] → [Exec Summary]
                                                          ↓
                                                   [Network Strategy]
                                                   (hub endpoints)
```
Nodes glow electric blue when "active". On page load, animate them lighting up sequentially with a 300ms delay between each. Show "Claude Sonnet 4.6" badge underneath.

**Recent Decisions table** (last 5 from `/api/v1/dispatch/history`):
Columns: Hub ID | Area ID | Type (badge) | Partner | Margin | Risk | Confidence | Time
- Type badge: green "3PL" or purple "4PL"
- Margin: red if negative, green if positive
- Risk: color-coded by value (< 40 green, 40–70 amber, > 70 red)

**Quick Action buttons:**
- "New Dispatch" → navigate to /dispatch
- "Optimize Partner" → navigate to /partners
- "Analyze Hub" → navigate to /hubs
- "Hub Health" → navigate to /hubs/summary

---

## Page 2: Dispatch (`/dispatch`)

The flagship page. Split into two panels.

### Left Panel — Input Form

Title: "🤖 AI Dispatch Recommender"
Subtitle: "5 AI agents · ~20 seconds · Claude Sonnet 4.6"

Form fields (styled dark inputs with labels):

- **Area** *(required)* — combobox / searchable dropdown. On page load fetch `GET /api/v1/areas` (returns `{ id, name, name_bn }[]`). Filter by name using fuzzy search (`fuse.js`). Each option shows `{name}` with `#{id}` in dim monospace on the right (e.g. `Dhanmondi - Road 3  #2`). Placeholder: "Search area...". While loading show a skeleton inside the trigger. The selected area's `id` is used as `area_id`. **This is the only required location field — the backend derives the hub automatically.**

- **Hub** *(optional)* — combobox / searchable dropdown. On page load fetch `GET /api/v1/hubs` (returns `{ id, name, operational_code }[]`). Filter by name using fuzzy search (`fuse.js`). Each option shows `{name}` with `{operational_code}` in dim monospace on the right (e.g. `Kalabagan Hub  ISD-1`). Placeholder: "Auto-detected from area...". Add a small grey label beneath: "Optional — if left blank, the hub is derived from the selected area." While loading show a skeleton inside the trigger. If selected, its `id` is sent as `hub_id`; if not selected, omit `hub_id` from the request body entirely.

- **Parcel Value (BDT)** — number input, placeholder "e.g. 1500". This is the merchant's cash-on-delivery (COD) value used to compute the COD fee per 4PL partner.
- **Weight (kg)** — number input with decimal, placeholder "e.g. 1.2". The API accepts kg; the backend converts to grams and looks up the exact weight-tier price for each partner (≤0.5kg / ≤1kg / ≤2kg / ≤3kg / ≤4kg / ≤5kg / >5kg).
- **SLA Days** — number input, default 3, min 1. The merchant's required delivery window. Shorter values tighten the SLA risk thresholds: 1 day uses LOW<5%/MED<15%, 3 days (default) uses LOW<15%/MED<35%.

Use `shadcn/ui` `Command` + `Popover` for both comboboxes. Style dark to match the rest of the app.

Below the form, a small info box:
> 💡 **High-data areas:** Area 91 (Tejgaon) · Area 2 (Kalabagan/Dhanmondi) · Area 1 (Comilla, OSD — higher charges). Hub is auto-detected; you can override it manually.

**Submit button:** Full width, electric blue gradient, "Run AI Pipeline →" text. Disabled while loading.

### Right Panel — Results

**While loading** (after submit):

Show an animated **Agent Pipeline Progress** component:

```
Step 1/5  [===>          ]  Volume Forecast        ✓ Done
Step 2/5  [=======>      ]  Cost Modeling          ⟳ Running...
Step 3/5  [              ]  SLA Risk Analysis      ○ Waiting
Step 4/5  [              ]  Partner Evaluation     ○ Waiting
Step 5/5  [              ]  Executive Summary      ○ Waiting
```

Agents light up sequentially with a pulsing animation on the active one. Since the API is one call, simulate the sequential animation with timed delays (4s per step) while waiting for the response.

**On success**, replace the progress with the result card:

**Decision Badge** — large centered badge:
- "3PL — Internal Fleet" (green) or "4PL — External Partner" (purple)

**4 metric cards in a 2×2 grid:**
- Partner: name + partner icon
- Expected Margin: BDT value (red if negative, green if positive), "per parcel"
- Risk Score: gauge-style display with color (0–100)
- Confidence: percentage with a circular progress ring

**Executive Summary** — dark card with a robot icon header, text appears with a typewriter animation character by character (simulate streaming). Title: "AI Executive Summary". Full `summary` text from the API.

**Warning banner** (if risk_score > 60):
⚠️ Amber banner: "High SLA risk detected. Review partner reliability before confirming dispatch."

---

## Page 3: Partners (`/partners`)

Title: "🤝 Partner Optimizer"
Subtitle: "AI-powered partner selection · SLA Risk + Evaluation agents"

### Input

On page load, fetch all areas from `GET /api/v1/areas` (returns `{ id, name, name_bn }[]`).

Replace the Area ID text input with a **combobox / searchable dropdown**:
- Search box at the top that filters by name using **fuzzy search** (use `fuse.js`)
- Each option shows: `{name}` with `#{id}` in dim monospace on the right (e.g. `Dhanmondi - Road 3  #2`)
- Placeholder: "Search area..."
- While areas are loading show a skeleton/spinner inside the dropdown trigger
- If the areas API fails, fall back to a plain number input with an error toast
- Style dark to match the rest of the app — use `shadcn/ui` `Command` + `Popover` for the combobox pattern

Then an **"Optimize →"** button. The selected area's `id` (integer) is passed as `area_id` to the optimize API.

### Results

**Winner Card** (large, prominent):
- Partner name in big text
- "OPTIMAL PARTNER" label
- Confidence score as a large circular gauge (e.g. 62%)
- SLA Risk Score with color coding

**Backup Partner Card** (smaller, below):
- "BACKUP OPTION" label
- Backup partner name
- Note: "Available if primary is at capacity"

**SLA Risk Gauge:**
A semicircular gauge (like a speedometer) showing the `sla_risk_score`:
- 0–40: Green zone "LOW"
- 40–70: Amber zone "MEDIUM"
- 70–100: Red zone "HIGH"
The needle animates to the value on load.

**Partner Comparison Table** — static explainer showing what the agents considered:
| Factor | Weight |
|--------|--------|
| SLA Breach Probability | 60% |
| Margin Impact | 30% |
| Availability | 10% |

---

## Page 4: Hubs (`/hubs`)

Title: "🏭 Hub Intelligence"
Subtitle: "Profitability prediction · Operating model advisor · Network Strategy agent"

### Hub input + two action buttons side by side:

On page load, fetch all active delivery hubs from `GET /api/v1/hubs` (returns `{ id, name, operational_code }[]`).

Replace the Hub ID text input with a **combobox / searchable dropdown**:
- Search box that filters hubs by name using **fuzzy search** (use `fuse.js`)
- Each option shows: `{name}` with `{operational_code}` in dim monospace on the right (e.g. `Kalabagan Hub  ISD-1`)
- Placeholder: "Search hub..."
- While hubs are loading show a skeleton/spinner inside the dropdown trigger
- If the hubs API fails, fall back to a plain number input with an error toast
- Style dark to match the rest of the app — use `shadcn/ui` `Command` + `Popover` for the combobox pattern

Two action buttons side by side (enabled only after a hub is selected):
- "Analyze Profitability" (blue)
- "Get Model Advice" (purple)

### Profitability Result Card

**Recommendation badge** — large, centered:
- "KEEP OPEN" → green with checkmark
- "CLOSE HUB" → red with X
- "CONVERT TO 4PL" → purple with arrows

**Key metrics row:**
- Projected 90-Day Margin: big BDT number (red if negative)
- Risk Score: color-coded badge
- Hub ID: monospace

**90-Day Margin Bar Chart** — simple horizontal bar visualization showing projected margin vs breakeven (zero line). Bar fills red for loss, green for profit. Animate on load.

### Model Advice Result Card

**3-column comparison** showing the three models:

```
┌─────────────┬─────────────┬─────────────┐
│   3PL Only  │  Hybrid     │  4PL Only   │
│  (Internal) │  (50/50)    │  (External) │
├─────────────┼─────────────┼─────────────┤
│  ✓ RECOMMENDED (highlighted border)     │
│  Margin: BDT X per parcel               │
│  Risk: XX/100                           │
└─────────────┴─────────────┴─────────────┘
```

Recommended model card has an electric blue glowing border. Others are dimmed.

Below: "Projected 90-Day Profitability: BDT X" in large text.

---

## Page 5: Hub Health (`/hubs/summary`)

Title: "🏥 Hub Health"
Subtitle: "AI-powered profitability check · Identifies losing hubs · Recommends partner reassignments"

This page calls `GET /api/v1/hubs/summary` on load. The API runs a single Claude analysis across all hubs using pre-aggregated contribution margin data — expect ~10 seconds.

### Loading state

Full-page skeleton with a centered pulsing message: "🤖 AI is analyzing all hubs…" with an electric blue animated progress bar across the top.

### Header stats row — 4 cards

After data loads, show:
- **Total Hubs Analyzed** — number from `total_hubs`
- **Losing Money** — count from `losing_hubs`, red if > 0
- **High Priority Actions** — count of hubs where `priority === "high"`, amber
- **Estimated Savings** — sum of all `estimated_margin_improvement_90d` across hubs with recommendations != "keep", shown as "BDT X over 90 days"

### Hub cards grid

Render one card per hub from `hubs[]`, sorted: high priority first, then medium, then low/keep.

Each card shows:
- **Hub name** (large) + hub ID in dim monospace
- **Recommendation badge** — color-coded pill:
  - `keep` → green "✓ KEEP"
  - `shift_to_4pl` → purple "→ SHIFT TO 4PL"
  - `shift_to_3pl` → emerald "← SHIFT TO 3PL"
  - `mixed_optimize` → amber "⚡ OPTIMIZE MIX"
  - `assign_partners` → blue "＋ ASSIGN PARTNERS"
- **Priority badge** — small pill: red "HIGH", amber "MEDIUM", grey "LOW"
- **Margin row** — "Current 90d Margin: BDT X" (red if negative, green if positive) + "Potential improvement: BDT +Y"
- **Area breakdown** — small stat chips: `{total_areas} areas total · {fourpl_areas} 4PL · {thrpl_areas} 3PL · {unassigned_areas} unassigned`
- **Recommended action text** — italic grey paragraph (the `recommended_action` field)
- **Suggested assignments accordion** — collapsed by default, click to expand:
  - Table: Area ID | Area Name | Current Partner | → | Recommended Partner | Reason
  - Current partner in amber (if 4PL) or grey (if 3PL/unassigned)
  - Recommended partner in green (3PL) or purple (4PL)
  - A **"Select All"** checkbox at the top of the accordion and individual checkboxes per row

### Apply Assignments button

A sticky bottom bar (appears when any assignments are checked):
```
[X assignments selected]                [Apply Selected Assignments →]
```
- Button triggers `POST /api/v1/hubs/assign-partners` with the selected `{ area_id, partner_id }` pairs
- Show a loading spinner on the button during the request
- On success: green toast "X area assignments updated" and refresh the page
- On failure: red toast with the error message
- The request body format: `{ "assignments": [{ "area_id": 91, "partner_id": 11 }, ...] }`

### Filter bar (top of cards)

Three toggle buttons to filter cards:
- **All** (default)
- **Losing Money** (hubs where `is_losing_money === true`)
- **Has Suggestions** (hubs where `suggested_assignments.length > 0`)

---

## Page 6: History (`/history`)

Title: "📋 Dispatch History"
Subtitle: "In-memory log · Last 50 decisions · Resets on server restart"

**Filter bar:** Search by Hub ID or Area ID (client-side filter).

**Table** with all history entries:

| Time | Hub | Area | Type | Partner | Margin | Risk | Confidence |
|------|-----|------|------|---------|--------|------|------------|

- **Type** column: colored badge — green "3PL" or purple "4PL"
- **Margin** column: red if negative, green if positive, BDT prefix
- **Risk** column: colored pill — green/amber/red
- **Confidence** column: small progress bar

Click any row to expand an accordion showing the full `summary` text.

**Empty state:** Centered illustration with text "No dispatch decisions yet. Run your first dispatch →" with a link to /dispatch.

**Auto-refresh toggle:** A toggle in the top right that, when on, refreshes every 30 seconds.

---

## API Integration

Base URL: `http://localhost:3000`

Use `fetch` or `axios` for all calls. Show a toast notification on API errors.

**Endpoints used:**
```
GET  /health                                → API status check
POST /api/v1/dispatch/recommend             → Dispatch page
GET  /api/v1/dispatch/history               → Dashboard + History page
GET  /api/v1/areas                          → Area dropdown (Partners + Dispatch page on load)
GET  /api/v1/partners/optimize?area_id=     → Partners page (hub derived server-side)
GET  /api/v1/hubs                           → Hub dropdown (Hubs + Dispatch page on load)
GET  /api/v1/hubs/summary                   → Hub Health page (AI analysis, ~10s)
POST /api/v1/hubs/assign-partners           → Hub Health page (apply partner assignments)
GET  /api/v1/hubs/:hubId/profitability      → Hubs page
GET  /api/v1/hubs/:hubId/model-advice       → Hubs page
```

**`POST /api/v1/hubs/assign-partners` body:**
```json
{
  "assignments": [
    { "area_id": 91, "partner_id": 11 },
    { "area_id": 2,  "partner_id": 3  }
  ]
}
```
Returns array of `{ area_id, partner_id, partner_name, status: "assigned"|"failed" }`.

**`GET /api/v1/hubs/summary` response shape:**
```json
{
  "generated_at": "2026-02-22T10:00:00Z",
  "total_hubs": 12,
  "losing_hubs": 4,
  "hubs": [
    {
      "hub_id": 2,
      "hub_name": "Kalabagan Hub",
      "recommendation": "shift_to_4pl",
      "priority": "high",
      "recommended_action": "This hub is losing BDT 45,000/month. Shifting 15 ISD-zone unassigned areas to Pathao (BDT 55/kg) would recover ~BDT 38,000.",
      "estimated_margin_improvement_90d": 114000,
      "is_losing_money": true,
      "avg_monthly_margin": -15000,
      "projected_margin_90d": -45000,
      "total_areas": 45,
      "fourpl_areas": 3,
      "thrpl_areas": 27,
      "unassigned_areas": 15,
      "suggested_assignments": [
        {
          "area_id": 91,
          "area_name": "Tejgaon Industrial",
          "current_partner_id": null,
          "current_partner_name": "Unassigned (3PL default)",
          "recommended_partner_id": 11,
          "recommended_partner_name": "Pathao",
          "reason": "ISD zone, cheapest 4PL at BDT 55/kg"
        }
      ]
    }
  ]
}
```

**Loading states:** Every API call must show a skeleton loader or progress indicator. Never show a blank panel.

**Error handling:** If an API call fails, show a red error card: "AI agents encountered an error. Please check the server and try again." with the error message.

---

## Shared Components

**`<RiskBadge score={78} />`** — colored pill: green (<40), amber (40–70), red (>70)

**`<TypeBadge type="3PL" />`** — green "3PL" or purple "4PL" badge

**`<MarginDisplay value={-783.59} />`** — "BDT -783.59" in red, or "BDT +245.10" in green

**`<ConfidenceRing confidence={42} />`** — circular SVG ring that fills to the percentage

**`<AgentPipeline active={2} />`** — the 5-step agent progress animation

**`<Skeleton />`** — shimmer placeholder for loading states

---

## Mock Data (for initial render / Lovable preview)

Use this mock data when the API is not available:

```json
// Dispatch result
{
  "type": "4PL",
  "partner": "Pathao",
  "expected_margin": 57.43,
  "risk_score": 28,
  "confidence": 74,
  "summary": "Dispatch Decision Report | Hub 2 | Area 91\n\nRecommendation: 4PL via Pathao\n\nPathao is the optimal partner for this area (ISD zone, 1kg parcel, BDT 1500 value). At BDT 55 total cost (delivery + COD fee), it offers the lowest all-in charge with a LOW SLA risk score of 28% breach probability. The 3-day SLA window is comfortably met. Expected margin: BDT 57.43 per parcel.\n\nNext Step: Confirm dispatch batch with Pathao operations team."
}

// Partner result
{
  "optimal_partner_id": 8,
  "optimal_partner_name": "Paper Fly",
  "confidence": 62,
  "backup_partner_id": 1,
  "backup_partner_name": "Go Go Bangla",
  "sla_risk_score": 50
}

// Hub profitability
{
  "hub_id": 129,
  "recommendation": "close",
  "projected_margin_90d": -918600,
  "risk_score": 87
}

// Hub model advice
{
  "hub_id": 129,
  "recommended_model": "3PL",
  "margin_uplift": 0,
  "risk_score": 85,
  "confidence": 55,
  "projected_profitability_90d": -916797
}
```

---

## Additional Details

- **Favicon:** Robot emoji 🤖 or a lightning bolt
- **Page title:** "DispatchMindAI — RedX"
- **Responsive:** Desktop-first but should work on tablet
- **No authentication** required — open access
- **Toast notifications:** Use a toast library (react-hot-toast) for success/error feedback
- **Smooth page transitions:** Fade in on route change

The overall feeling should be: *a Bloomberg terminal designed by an AI startup* — dense with data, dark, with glowing electric blue AI elements that convey intelligence and speed.

---

## API Integration Code

Create this file as `src/lib/api.ts` — it handles all backend communication.

**IMPORTANT:** All responses from this backend are wrapped in an envelope:
```json
{ "success": true, "data": { ... }, "meta": { "timestamp": "...", "requestId": "..." } }
```
Always unwrap `.data` before returning to components.

```typescript
// src/lib/api.ts

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// ─── Response Types ───────────────────────────────────────────────────────────

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta: { timestamp: string; requestId: string };
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export interface Area {
  id: number;
  name: string;
  name_bn: string | null;
}

export interface Hub {
  id: number;
  name: string;
  operational_code: string | null;
}

export interface DispatchResult {
  type: '3PL' | '4PL';
  partner: string;
  expected_margin: number;
  risk_score: number;
  confidence: number;
  summary: string;
}

export interface DispatchHistoryItem extends DispatchResult {
  hub_id: number;
  area_id: number;
  decided_at: string;
}

export interface PartnerOptimizeResult {
  optimal_partner_id: number;
  optimal_partner_name: string;
  confidence: number;
  backup_partner_id: number | null;
  backup_partner_name: string | null;
  sla_risk_score: number;
}

export interface HubProfitabilityResult {
  hub_id: number;
  recommendation: 'keep' | 'close' | 'convert';
  projected_margin_90d: number;
  risk_score: number;
}

export interface HubModelAdviceResult {
  hub_id: number;
  recommended_model: '3PL' | '4PL' | 'Hybrid';
  margin_uplift: number;
  risk_score: number;
  confidence: number;
  projected_profitability_90d: number;
}

// ─── Base Fetch ───────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.error?.message ?? message;
    } catch {}
    throw new Error(message);
  }

  const json = await res.json() as ApiEnvelope<T>;
  return json.data;
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

export const api = {
  /** Fetch all active areas with hub mappings — for the area dropdown */
  listAreas(): Promise<Area[]> {
    return apiFetch<Area[]>('/api/v1/areas');
  },

  /** Fetch all active delivery hubs — for the hub dropdown */
  listHubs(): Promise<Hub[]> {
    return apiFetch<Hub[]>('/api/v1/hubs');
  },

  /** Check if the backend is reachable */
  health(): Promise<HealthResponse> {
    return fetch(`${BASE_URL}/health`).then(r => r.json());
  },

  /** Run the full 5-agent AI dispatch pipeline (~20 seconds) */
  dispatchRecommend(body: {
    hub_id: number;
    area_id: number;
    parcel_value: number;
    weight: number;
    sla_days?: number;
  }): Promise<DispatchResult> {
    return apiFetch<DispatchResult>('/api/v1/dispatch/recommend', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  /** Get the last 50 dispatch decisions */
  dispatchHistory(): Promise<DispatchHistoryItem[]> {
    return apiFetch<DispatchHistoryItem[]>('/api/v1/dispatch/history');
  },

  /** Run SLA Risk + Partner Evaluation agents for an area */
  partnersOptimize(areaId: number): Promise<PartnerOptimizeResult> {
    return apiFetch<PartnerOptimizeResult>(
      `/api/v1/partners/optimize?area_id=${areaId}`
    );
  },

  /** Run Volume Forecast + Cost Modeling + Network Strategy for a hub */
  hubProfitability(hubId: number): Promise<HubProfitabilityResult> {
    return apiFetch<HubProfitabilityResult>(`/api/v1/hubs/${hubId}/profitability`);
  },

  /** Compare 3PL vs 4PL vs Hybrid operating models for a hub */
  hubModelAdvice(hubId: number): Promise<HubModelAdviceResult> {
    return apiFetch<HubModelAdviceResult>(`/api/v1/hubs/${hubId}/model-advice`);
  },
};
```

**Environment variable setup** — create `.env` in the Lovable project root:
```
VITE_API_URL=http://localhost:3000
```

**Usage example in a component:**
```typescript
import { useState } from 'react';
import { api, DispatchResult } from '@/lib/api';
import toast from 'react-hot-toast';

const [result, setResult] = useState<DispatchResult | null>(null);
const [loading, setLoading] = useState(false);

async function handleSubmit() {
  setLoading(true);
  try {
    const data = await api.dispatchRecommend({ hub_id: 2, area_id: 91, parcel_value: 1500, weight: 1.0, sla_days: 3 });
    setResult(data);
    toast.success('AI pipeline complete');
  } catch (err) {
    toast.error((err as Error).message);
  } finally {
    setLoading(false);
  }
}
```

**Health check hook** (runs every 30 seconds):
```typescript
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export function useApiHealth() {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const check = () => api.health().then(() => setOnline(true)).catch(() => setOnline(false));
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  return online;
}
```

---

## Change Log

All changes below should be applied on top of the original prompt above.

---

### Change 1 — Update API base URL to production

```
Update the API base URL from http://localhost:3000 to the production Vercel deployment:
https://dispatch-mind-ai-beta.vercel.app

Update VITE_API_URL in the environment config and the BASE_URL fallback in src/lib/api.ts.
```

---

### Change 2 — Merge Partner Optimizer into AI Dispatch Recommender

```
Remove the "Partner Optimizer" tab and the /partners page entirely.
Remove it from the sidebar navigation.

The dispatch API (POST /api/v1/dispatch/recommend) now returns full partner
selection data. Update the DispatchResult type in src/lib/api.ts to:

export interface DispatchResult {
  type: '3PL' | '4PL';
  partner: string;
  partner_id: number | null;
  backup_partner: string | null;
  backup_partner_id: number | null;
  expected_margin: number;
  risk_score: number;
  confidence: number;
  summary: string;
}

In the AI Dispatch Recommender result card, show:
1. Decision badge: "3PL – Shopup Internal" (green) or "4PL – [partner name]" (purple/blue)
2. If type is "4PL" and backup_partner is not null, show a secondary row:
   "Backup: [backup_partner]" in a smaller dimmed style below the main partner
3. Keep the existing metrics: Expected margin (BDT/parcel), Confidence %, SLA risk score
4. Keep the AI Executive Summary text with typewriter animation

The sidebar should now have 5 items (remove Partners):
1. Dashboard (/)
2. Dispatch (/dispatch) — renamed label: "AI Dispatch"
3. Hubs (/hubs)
4. Hub Health (/hubs/summary)
5. History (/history)
```
