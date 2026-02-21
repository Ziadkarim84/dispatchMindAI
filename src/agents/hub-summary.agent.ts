import { AgentResult } from '@common/types';
import { HubSummaryItem, HubSummaryResult } from '@common/types';
import { query } from '@database/connection';
import { runPrompt } from './base.agent';
import { logger } from '@common/utils/logger.util';

const SYSTEM_PROMPT = `You are a logistics network optimization expert for RedX, a courier company in Bangladesh.
You will receive aggregated hub performance data (last 3 months) including:
- Revenue, 4PL partner costs, fixed costs, and margins per hub
- Current 3PL/4PL/unassigned area breakdown per hub
- All areas served by each hub with their current partner assignments
- Available 4PL partners and their zone-based pricing

Rules:
- partner_id=3 ("Shopup Internal") means the area uses 3PL (internal RedX fleet) — no external partner cost
- Any other partner_id means 4PL (external courier partner)
- Unassigned areas (no active partner entry) are also 3PL by default
- Zone IDs: 1=ISD (Dhaka City), 2=SUB (Dhaka Suburbs), 7+=OSD (Outside Dhaka)

Your task: for EACH hub, assess profitability and recommend the best action.
- If a 3PL-heavy hub is losing money → suggest shifting specific areas to 4PL partners (pick the cheapest partner per zone)
- If a 4PL-heavy hub is losing money due to high partner costs → suggest reverting specific areas to 3PL
- If a hub has unassigned areas → suggest assigning the cheapest appropriate 4PL partner (or 3PL if margins are better)
- If a hub is profitable and well-configured → recommend "keep"

For suggested_assignments: only include areas that actually need to change. Use the real area_ids from the data.
recommended_partner_id=3 means "revert to 3PL (Shopup Internal)".

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "hub_id": <number>,
    "hub_name": "<string>",
    "recommendation": "keep" | "shift_to_4pl" | "shift_to_3pl" | "mixed_optimize" | "assign_partners",
    "priority": "high" | "medium" | "low",
    "recommended_action": "<clear human-readable explanation of what to do and why>",
    "estimated_margin_improvement_90d": <number in BDT, positive means improvement>,
    "suggested_assignments": [
      {
        "area_id": <number>,
        "area_name": "<string>",
        "current_partner_id": <number | null>,
        "current_partner_name": "<string>",
        "recommended_partner_id": <number>,
        "recommended_partner_name": "<string>",
        "reason": "<brief reason>"
      }
    ]
  }
]`;

// ─── DB fetch helpers ──────────────────────────────────────────────────────────

interface HubMarginRow {
  hub_id: number;
  hub_name: string;
  total_parcels_3m: number;
  total_revenue_3m: number;
  total_4pl_cost_3m: number;
  total_fixed_cost_3m: number;
  total_margin_3m: number;
  avg_margin_per_parcel: number;
}

async function fetchHubMargins(): Promise<HubMarginRow[]> {
  return query<HubMarginRow[]>(
    `SELECT
       h.ID                                                          AS hub_id,
       h.HUB_NAME                                                   AS hub_name,
       COALESCE(SUM(cm.total_parcels), 0)                           AS total_parcels_3m,
       COALESCE(SUM(cm.total_revenue), 0)                           AS total_revenue_3m,
       COALESCE(SUM(cm.total_4pl_cost), 0)                          AS total_4pl_cost_3m,
       COALESCE(SUM(cm.total_fixed_cost), 0)                        AS total_fixed_cost_3m,
       COALESCE(SUM(
         cm.total_revenue - cm.total_4pl_cost - cm.total_fixed_cost
       ), 0)                                                         AS total_margin_3m,
       COALESCE(ROUND(
         SUM(cm.total_revenue - cm.total_4pl_cost - cm.total_fixed_cost)
         / NULLIF(SUM(cm.total_parcels), 0), 2
       ), 0)                                                         AS avg_margin_per_parcel
     FROM sl_hubs h
     LEFT JOIN dm_hub_contribution_margin cm ON cm.hub_id = h.ID
       AND (cm.year > YEAR(DATE_SUB(NOW(), INTERVAL 3 MONTH))
         OR (cm.year = YEAR(DATE_SUB(NOW(), INTERVAL 3 MONTH))
             AND cm.month >= MONTH(DATE_SUB(NOW(), INTERVAL 3 MONTH))))
     WHERE h.STATUS = 'active'
       AND h.IS_DELIVERY = 1
     GROUP BY h.ID, h.HUB_NAME
     HAVING total_parcels_3m > 0
     ORDER BY total_margin_3m ASC`
  );
}

interface AreaRow {
  hub_id: number;
  area_id: number;
  area_name: string;
  zone_id: number;
  partner_id: number | null;
  partner_name: string | null;
}

async function fetchAreaAssignments(): Promise<AreaRow[]> {
  return query<AreaRow[]>(
    `SELECT
       ah.HUB_ID        AS hub_id,
       ah.AREA_ID       AS area_id,
       a.NAME           AS area_name,
       a.ZONE_ID        AS zone_id,
       ap.PARTNER_ID    AS partner_id,
       dp.NAME          AS partner_name
     FROM sl_area_hub ah
     JOIN sl_areas a ON a.ID = ah.AREA_ID
     LEFT JOIN sl_area_partners ap ON ap.AREA_ID = ah.AREA_ID AND ap.STATUS = 'active'
     LEFT JOIN sl_delivery_partners dp ON dp.ID = ap.PARTNER_ID
     WHERE ah.STATUS = 'active'
     ORDER BY ah.HUB_ID, ah.AREA_ID`
  );
}

interface PartnerPricingRow {
  partner_id: number;
  partner_name: string;
  zone_id: number;
  zone_name: string;
  kg1_price: number | null;
  cod_percentage: number | null;
}

async function fetchAvailablePartners(): Promise<PartnerPricingRow[]> {
  return query<PartnerPricingRow[]>(
    `SELECT
       dp.ID             AS partner_id,
       dp.NAME           AS partner_name,
       pp.zone_id,
       pp.zone_name,
       pp.kg1_price,
       pp.cod_percentage
     FROM sl_delivery_partners dp
     JOIN sl_fourpl_partner_pricing pp ON pp.partner_id = dp.ID AND pp.status = 'active'
     WHERE dp.STATUS = 'active'
       AND dp.ID != 3
     ORDER BY dp.ID, pp.zone_id`
  );
}

// ─── Data processing ───────────────────────────────────────────────────────────

interface ProcessedArea {
  area_id: number;
  area_name: string;
  zone_id: number;
  partner_ids: number[];        // all active partner IDs for this area
  partner_names: string[];
  is_4pl: boolean;              // has any active non-Shopup partner
  is_unassigned: boolean;       // no active partner at all
}

interface HubContext {
  hub_id: number;
  hub_name: string;
  total_parcels_3m: number;
  total_revenue_3m: number;
  total_4pl_cost_3m: number;
  total_fixed_cost_3m: number;
  total_margin_3m: number;
  avg_margin_per_parcel: number;
  total_areas: number;
  fourpl_areas: number;
  thrpl_areas: number;
  unassigned_areas: number;
  areas: ProcessedArea[];
}

function buildHubContexts(margins: HubMarginRow[], areaRows: AreaRow[]): HubContext[] {
  // Group area rows by hub_id, then by area_id
  const hubAreaMap = new Map<number, Map<number, ProcessedArea>>();

  for (const row of areaRows) {
    if (!hubAreaMap.has(row.hub_id)) hubAreaMap.set(row.hub_id, new Map());
    const areaMap = hubAreaMap.get(row.hub_id)!;

    if (!areaMap.has(row.area_id)) {
      areaMap.set(row.area_id, {
        area_id: row.area_id,
        area_name: row.area_name,
        zone_id: row.zone_id,
        partner_ids: [],
        partner_names: [],
        is_4pl: false,
        is_unassigned: true,
      });
    }

    const area = areaMap.get(row.area_id)!;
    if (row.partner_id !== null) {
      area.is_unassigned = false;
      if (!area.partner_ids.includes(row.partner_id)) {
        area.partner_ids.push(row.partner_id);
        area.partner_names.push(row.partner_name ?? 'Unknown');
      }
      if (row.partner_id !== 3) {
        area.is_4pl = true;
      }
    }
  }

  return margins.map(m => {
    const areaMap = hubAreaMap.get(m.hub_id) ?? new Map<number, ProcessedArea>();
    const areas = Array.from(areaMap.values());

    const fourpl_areas = areas.filter(a => a.is_4pl).length;
    const unassigned_areas = areas.filter(a => a.is_unassigned).length;
    const thrpl_areas = areas.length - fourpl_areas - unassigned_areas;

    return {
      hub_id: m.hub_id,
      hub_name: m.hub_name,
      total_parcels_3m: m.total_parcels_3m,
      total_revenue_3m: m.total_revenue_3m,
      total_4pl_cost_3m: m.total_4pl_cost_3m,
      total_fixed_cost_3m: m.total_fixed_cost_3m,
      total_margin_3m: m.total_margin_3m,
      avg_margin_per_parcel: m.avg_margin_per_parcel,
      total_areas: areas.length,
      fourpl_areas,
      thrpl_areas,
      unassigned_areas,
      areas,
    };
  });
}

function parseClaudeJson<T>(raw: string): T {
  const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  const start = cleaned.search(/[{[]/);
  if (start === -1) throw new Error(`No JSON found in Claude response: ${cleaned.slice(0, 100)}`);
  const openChar = cleaned[start];
  const closeChar = openChar === '{' ? '}' : ']';
  const end = cleaned.lastIndexOf(closeChar);
  if (end === -1) throw new Error(`No closing ${closeChar} found in Claude response`);
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

// ─── Main agent ────────────────────────────────────────────────────────────────

type ClaudeHubItem = HubSummaryItem & { reasoning?: string };

export async function runHubSummaryAgent(): Promise<AgentResult<HubSummaryResult>> {
  logger.debug('[HubSummaryAgent] Fetching hub data');

  const [margins, areaRows, partners] = await Promise.all([
    fetchHubMargins(),
    fetchAreaAssignments(),
    fetchAvailablePartners(),
  ]);

  logger.debug('[HubSummaryAgent] DB fetch complete', {
    hubs: margins.length,
    areaRows: areaRows.length,
    partners: partners.length,
  });

  if (margins.length === 0) {
    return {
      data: { generated_at: new Date().toISOString(), total_hubs: 0, losing_hubs: 0, hubs: [] },
      reasoning: 'No hub contribution data found.',
      confidence: 0,
    };
  }

  const hubContexts = buildHubContexts(margins, areaRows);

  // Limit areas per hub to avoid token overflow (send up to 30 areas per hub)
  const hubsForPrompt = hubContexts.map(h => ({
    ...h,
    areas: h.areas.slice(0, 30).map(a => ({
      area_id: a.area_id,
      area_name: a.area_name,
      zone_id: a.zone_id,
      current_partner_id: a.is_unassigned ? null : (a.partner_ids[0] ?? null),
      current_partner_name: a.is_unassigned
        ? 'Unassigned (3PL default)'
        : (a.partner_names[0] ?? 'Shopup Internal'),
      is_4pl: a.is_4pl,
    })),
    area_note: h.areas.length > 30 ? `(showing 30 of ${h.areas.length} areas)` : undefined,
  }));

  const userPrompt = `Hub performance summary (last 3 months):
${JSON.stringify(hubsForPrompt, null, 2)}

Available 4PL partners and their pricing per zone:
${JSON.stringify(partners, null, 2)}

Note: partner_id=3 means "Shopup Internal" (3PL, no per-parcel external cost).
Analyze each hub and return your recommendations.`;

  logger.debug('[HubSummaryAgent] Calling Claude', { hubCount: hubContexts.length });
  let raw: string;
  try {
    raw = await runPrompt(SYSTEM_PROMPT, userPrompt);
    logger.debug('[HubSummaryAgent] Claude raw response', { raw: raw.slice(0, 500) });
  } catch (err) {
    logger.error('[HubSummaryAgent] Claude call failed', { message: (err as Error).message });
    throw err;
  }

  let parsed: ClaudeHubItem[];
  try {
    parsed = parseClaudeJson<ClaudeHubItem[]>(raw);
  } catch (err) {
    logger.error('[HubSummaryAgent] JSON parse failed', { raw: raw.slice(0, 300), message: (err as Error).message });
    throw err;
  }

  const hubs: HubSummaryItem[] = parsed.map(item => ({
    hub_id: item.hub_id,
    hub_name: item.hub_name,
    recommendation: item.recommendation,
    priority: item.priority,
    recommended_action: item.recommended_action,
    estimated_margin_improvement_90d: item.estimated_margin_improvement_90d,
    suggested_assignments: item.suggested_assignments ?? [],
    // attach margin stats from our pre-fetched data
    ...(() => {
      const ctx = hubContexts.find(h => h.hub_id === item.hub_id);
      return ctx ? {
        total_areas: ctx.total_areas,
        fourpl_areas: ctx.fourpl_areas,
        thrpl_areas: ctx.thrpl_areas,
        unassigned_areas: ctx.unassigned_areas,
        avg_monthly_margin: Math.round(ctx.total_margin_3m / 3),
        projected_margin_90d: ctx.total_margin_3m,
        avg_margin_per_parcel: ctx.avg_margin_per_parcel,
        total_parcels_3m: ctx.total_parcels_3m,
        is_losing_money: ctx.total_margin_3m < 0,
      } : {
        total_areas: 0, fourpl_areas: 0, thrpl_areas: 0, unassigned_areas: 0,
        avg_monthly_margin: 0, projected_margin_90d: 0, avg_margin_per_parcel: 0,
        total_parcels_3m: 0, is_losing_money: false,
      };
    })(),
  }));

  const losing_hubs = hubs.filter(h => h.is_losing_money).length;

  return {
    data: {
      generated_at: new Date().toISOString(),
      total_hubs: hubs.length,
      losing_hubs,
      hubs,
    },
    reasoning: `Analyzed ${hubs.length} hubs. ${losing_hubs} are losing money.`,
    confidence: 75,
  };
}
