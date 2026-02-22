import { AgentResult } from '@common/types';
import { HubSummaryItem, HubSummaryResult, AreaAssignment } from '@common/types';
import { query } from '@database/connection';
import { runPromptWithOptions } from './base.agent';
import { logger } from '@common/utils/logger.util';

// Claude only receives hub-level summaries — no per-area rows.
// suggested_assignments are generated programmatically after Claude's response.
const SYSTEM_PROMPT = `You are a logistics network optimization expert for RedX, a courier company in Bangladesh.
You will receive aggregated hub performance data (last 3 months):
- Revenue, 4PL partner costs, fixed costs, and contribution margin per hub
- Area breakdown: total areas, fourpl (active non-Shopup partner), thrpl (Shopup Internal), unassigned
- Available 4PL partner pricing per zone

Rules:
- partner_id=3 (Shopup Internal) = 3PL, zero external cost
- fourpl_areas = areas served by an external 4PL courier
- unassigned_areas = no partner assigned, defaults to 3PL
- Zone IDs: 1=ISD (Dhaka City), 2=SUB (Dhaka Suburbs), 7+=OSD (Outside Dhaka)

For each hub, return one of:
- "keep"           — hub is profitable, no action needed
- "shift_to_4pl"   — hub losing money, routing to 4PL partner would reduce cost
- "shift_to_3pl"   — hub losing money due to high 4PL costs, bring back in-house
- "mixed_optimize" — some areas should go 4PL, others back to 3PL
- "assign_partners"— hub has unassigned areas that need a partner

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "hub_id": <number>,
    "hub_name": "<string>",
    "recommendation": "keep" | "shift_to_4pl" | "shift_to_3pl" | "mixed_optimize" | "assign_partners",
    "priority": "high" | "medium" | "low",
    "recommended_action": "<clear human-readable explanation of what to do and why>",
    "estimated_margin_improvement_90d": <number in BDT, positive means improvement>
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
  zone_id: number;        // 1=ISD, 2=SUB, 3=OSD (simplified)
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
  partner_id: number | null;   // primary active partner (first non-null)
  partner_name: string | null;
  is_4pl: boolean;
  is_unassigned: boolean;
}

interface HubAreaBreakdown {
  total: number;
  fourpl: number;
  thrpl: number;
  unassigned: number;
  areas: ProcessedArea[];
}

function buildAreaBreakdowns(areaRows: AreaRow[]): Map<number, HubAreaBreakdown> {
  // First pass: collect all partner_ids per area
  // Track the best 4PL partner separately — an area may have both Shopup Internal (ID=3)
  // AND a real 4PL partner active simultaneously (e.g. after a seed run). When that happens,
  // display the 4PL partner as the canonical current partner so suggestions are accurate.
  const areaMap = new Map<number, {
    hubId: number;
    area: ProcessedArea;
    fourplPartner: { id: number; name: string | null } | null;
  }>();

  for (const row of areaRows) {
    if (!areaMap.has(row.area_id)) {
      areaMap.set(row.area_id, {
        hubId: row.hub_id,
        fourplPartner: null,
        area: {
          area_id: row.area_id,
          area_name: row.area_name,
          zone_id: row.zone_id,
          partner_id: null,
          partner_name: null,
          is_4pl: false,
          is_unassigned: true,
        },
      });
    }
    const entry = areaMap.get(row.area_id)!;
    if (row.partner_id !== null) {
      entry.area.is_unassigned = false;
      if (entry.area.partner_id === null) {
        entry.area.partner_id = row.partner_id;
        entry.area.partner_name = row.partner_name;
      }
      if (row.partner_id !== 3) {
        entry.area.is_4pl = true;
        // Prefer the first real 4PL partner encountered for display
        if (!entry.fourplPartner) {
          entry.fourplPartner = { id: row.partner_id, name: row.partner_name };
        }
      }
    }
  }

  // If the area is 4PL, overwrite the display partner with the actual 4PL partner
  // (avoids showing "ShopUp Internal" as current when a real 4PL partner co-exists)
  for (const { area, fourplPartner } of areaMap.values()) {
    if (area.is_4pl && fourplPartner) {
      area.partner_id = fourplPartner.id;
      area.partner_name = fourplPartner.name;
    }
  }

  // Second pass: group by hub
  const hubMap = new Map<number, HubAreaBreakdown>();
  for (const { hubId, area } of areaMap.values()) {
    if (!hubMap.has(hubId)) {
      hubMap.set(hubId, { total: 0, fourpl: 0, thrpl: 0, unassigned: 0, areas: [] });
    }
    const bd = hubMap.get(hubId)!;
    bd.total++;
    bd.areas.push(area);
    if (area.is_4pl)           bd.fourpl++;
    else if (area.is_unassigned) bd.unassigned++;
    else                         bd.thrpl++;
  }
  return hubMap;
}

// Maps sl_areas.ZONE_ID → sl_fourpl_partner_pricing.zone_id
function toPartnerZoneId(zoneId: number): number {
  if (zoneId === 1) return 1;
  if (zoneId === 2) return 2;
  return 3; // 7+ → OSD
}

function cheapestPartnerForZone(
  partnerZoneId: number,
  partners: PartnerPricingRow[]
): PartnerPricingRow | null {
  const candidates = partners.filter(p => p.zone_id === partnerZoneId && p.kg1_price !== null);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, p) => (p.kg1_price! < best.kg1_price! ? p : best));
}

const MAX_SUGGESTIONS = 20;
const MAX_PER_DIRECTION = 10; // max suggestions per direction when showing both

function buildSuggestedAssignments(
  recommendation: string,
  breakdown: HubAreaBreakdown,
  partners: PartnerPricingRow[]
): AreaAssignment[] {
  const suggestions: AreaAssignment[] = [];

  // ── 3PL/unassigned → cheapest 4PL ──────────────────────────────────────────
  const shouldSuggest4pl = recommendation !== 'shift_to_3pl' && recommendation !== 'keep';
  if (shouldSuggest4pl) {
    const limit = breakdown.areas.some(a => a.is_4pl) ? MAX_PER_DIRECTION : MAX_SUGGESTIONS;
    const candidates = breakdown.areas
      .filter(a => a.is_unassigned || (!a.is_4pl && !a.is_unassigned))
      .slice(0, limit);

    for (const area of candidates) {
      const partnerZoneId = toPartnerZoneId(area.zone_id);
      const partner = cheapestPartnerForZone(partnerZoneId, partners);
      if (!partner) continue;
      suggestions.push({
        area_id: area.area_id,
        area_name: area.area_name,
        current_partner_id: area.partner_id,
        current_partner_name: area.is_unassigned
          ? 'Unassigned (3PL default)'
          : (area.partner_name ?? 'Shopup Internal'),
        recommended_partner_id: partner.partner_id,
        recommended_partner_name: partner.partner_name,
        reason: `Assign to cheapest 4PL for zone (BDT ${partner.kg1_price}/kg)`,
      });
    }
  }

  // ── 4PL → Shopup Internal (3PL) ────────────────────────────────────────────
  // Only suggest reverting to 3PL when explicitly recommended — never for shift_to_4pl
  // or assign_partners (those should only move areas TO 4PL, not away from it).
  const shouldSuggest3pl = recommendation === 'shift_to_3pl' || recommendation === 'mixed_optimize';
  if (shouldSuggest3pl) {
    const limit = shouldSuggest4pl ? MAX_PER_DIRECTION : MAX_SUGGESTIONS;
    const candidates = breakdown.areas
      .filter(a => a.is_4pl)
      .slice(0, limit);

    for (const area of candidates) {
      suggestions.push({
        area_id: area.area_id,
        area_name: area.area_name,
        current_partner_id: area.partner_id,
        current_partner_name: area.partner_name ?? `Partner ${area.partner_id}`,
        recommended_partner_id: 3,
        recommended_partner_name: 'Shopup Internal',
        reason: 'Revert to 3PL (Shopup Internal) — evaluate if internal routing reduces cost',
      });
    }
  }

  // ── Optimize between 4PL partners ──────────────────────────────────────────
  // When areas are already using a 4PL partner but not the cheapest one for their
  // zone, suggest switching to the cheaper alternative (e.g. Pathao → Steadfast).
  // Applies for shift_to_4pl (where all areas may already be 4PL but expensive)
  // and mixed_optimize. Skips areas that already use the cheapest option.
  const shouldOptimize4pl = recommendation === 'shift_to_4pl' || recommendation === 'mixed_optimize';
  if (shouldOptimize4pl) {
    const remaining = MAX_SUGGESTIONS - suggestions.length;
    const candidates = breakdown.areas
      .filter(a => a.is_4pl)
      .slice(0, remaining);

    for (const area of candidates) {
      const partnerZoneId = toPartnerZoneId(area.zone_id);
      const cheapest = cheapestPartnerForZone(partnerZoneId, partners);
      if (!cheapest || cheapest.partner_id === area.partner_id) continue; // already optimal
      suggestions.push({
        area_id: area.area_id,
        area_name: area.area_name,
        current_partner_id: area.partner_id,
        current_partner_name: area.partner_name ?? `Partner ${area.partner_id}`,
        recommended_partner_id: cheapest.partner_id,
        recommended_partner_name: cheapest.partner_name,
        reason: `Switch to cheaper 4PL for this zone (BDT ${cheapest.kg1_price}/kg)`,
      });
    }
  }

  return suggestions;
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

interface ClaudeHubRec {
  hub_id: number;
  hub_name: string;
  recommendation: HubSummaryItem['recommendation'];
  priority: HubSummaryItem['priority'];
  recommended_action: string;
  estimated_margin_improvement_90d: number;
}

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

  const areaBreakdowns = buildAreaBreakdowns(areaRows);

  // Pre-filter: only send the worst hubs to Claude (max 15).
  // Hubs are already sorted by total_margin_3m ASC (worst first).
  // Profitable hubs with no unassigned areas auto-get "keep".
  const MAX_CLAUDE_HUBS = 15;
  const allProblemHubs = margins.filter(m => {
    const bd = areaBreakdowns.get(m.hub_id);
    return m.total_margin_3m < 0 || (bd && bd.unassigned > 0);
  });
  const problemHubs = allProblemHubs.slice(0, MAX_CLAUDE_HUBS);
  const keepHubs = margins.filter(m => !problemHubs.some(p => p.hub_id === m.hub_id));

  logger.debug('[HubSummaryAgent] Hub split', {
    problemHubs: problemHubs.length,
    autoKeep: keepHubs.length,
  });

  // Build compact hub summaries for Claude — no per-area detail rows
  const hubsForClaude = problemHubs.map(m => {
    const bd = areaBreakdowns.get(m.hub_id);
    return {
      hub_id: m.hub_id,
      hub_name: m.hub_name,
      total_parcels_3m: m.total_parcels_3m,
      total_revenue_3m: m.total_revenue_3m,
      total_4pl_cost_3m: m.total_4pl_cost_3m,
      total_fixed_cost_3m: m.total_fixed_cost_3m,
      total_margin_3m: m.total_margin_3m,
      avg_margin_per_parcel: m.avg_margin_per_parcel,
      area_breakdown: bd
        ? { total: bd.total, fourpl: bd.fourpl, thrpl: bd.thrpl, unassigned: bd.unassigned }
        : { total: 0, fourpl: 0, thrpl: 0, unassigned: 0 },
    };
  });

  const userPrompt = `Hub performance summaries (last 3 months) — ${hubsForClaude.length} hubs:
${JSON.stringify(hubsForClaude, null, 2)}

Available 4PL partners and zone pricing:
${JSON.stringify(partners, null, 2)}

Analyze each hub and return your recommendations.`;

  // Auto-keep hubs — no Claude call needed for these
  const autoKeepItems: HubSummaryItem[] = keepHubs.map(m => {
    const bd = areaBreakdowns.get(m.hub_id);
    const hasUnassigned = bd && bd.unassigned > 0;
    return {
      hub_id: m.hub_id,
      hub_name: m.hub_name,
      recommendation: hasUnassigned ? 'assign_partners' : 'keep',
      priority: hasUnassigned ? 'medium' : 'low',
      recommended_action: hasUnassigned
        ? `Hub has ${bd!.unassigned} unassigned areas. Consider assigning a 4PL partner.`
        : 'Hub is profitable. No action needed.',
      estimated_margin_improvement_90d: 0,
      suggested_assignments: hasUnassigned && bd
        ? buildSuggestedAssignments('assign_partners', bd, partners)
        : [],
      total_areas: bd?.total ?? 0,
      fourpl_areas: bd?.fourpl ?? 0,
      thrpl_areas: bd?.thrpl ?? 0,
      unassigned_areas: bd?.unassigned ?? 0,
      avg_monthly_margin: Math.round(m.total_margin_3m / 3),
      projected_margin_90d: m.total_margin_3m,
      avg_margin_per_parcel: m.avg_margin_per_parcel,
      total_parcels_3m: m.total_parcels_3m,
      is_losing_money: false,
    };
  });

  // If no problem hubs, skip Claude entirely
  if (hubsForClaude.length === 0) {
    return {
      data: {
        generated_at: new Date().toISOString(),
        total_hubs: autoKeepItems.length,
        losing_hubs: 0,
        hubs: autoKeepItems,
      },
      reasoning: 'All hubs are profitable with no unassigned areas.',
      confidence: 90,
    };
  }

  logger.debug('[HubSummaryAgent] Calling Claude', {
    hubCount: hubsForClaude.length,
    promptTokensEstimate: Math.round(userPrompt.length / 4),
  });

  // Allow ~300 tokens per hub for the JSON response
  const maxOutputTokens = Math.min(hubsForClaude.length * 350 + 500, 8192);

  let raw: string;
  try {
    raw = await runPromptWithOptions(SYSTEM_PROMPT, userPrompt, maxOutputTokens);
    logger.debug('[HubSummaryAgent] Claude response received');
  } catch (err) {
    logger.error('[HubSummaryAgent] Claude call failed', { message: (err as Error).message });
    throw err;
  }

  let recs: ClaudeHubRec[];
  try {
    recs = parseClaudeJson<ClaudeHubRec[]>(raw);
  } catch (err) {
    logger.error('[HubSummaryAgent] JSON parse failed', { raw: raw.slice(0, 300), message: (err as Error).message });
    throw err;
  }

  const claudeHubs: HubSummaryItem[] = recs.map(rec => {
    const margin = margins.find(m => m.hub_id === rec.hub_id);
    const bd = areaBreakdowns.get(rec.hub_id);

    const suggested_assignments = bd
      ? buildSuggestedAssignments(rec.recommendation, bd, partners)
      : [];

    return {
      hub_id: rec.hub_id,
      hub_name: rec.hub_name,
      recommendation: rec.recommendation,
      priority: rec.priority,
      recommended_action: rec.recommended_action,
      estimated_margin_improvement_90d: rec.estimated_margin_improvement_90d,
      suggested_assignments,
      total_areas: bd?.total ?? 0,
      fourpl_areas: bd?.fourpl ?? 0,
      thrpl_areas: bd?.thrpl ?? 0,
      unassigned_areas: bd?.unassigned ?? 0,
      avg_monthly_margin: margin ? Math.round(margin.total_margin_3m / 3) : 0,
      projected_margin_90d: margin?.total_margin_3m ?? 0,
      avg_margin_per_parcel: margin?.avg_margin_per_parcel ?? 0,
      total_parcels_3m: margin?.total_parcels_3m ?? 0,
      is_losing_money: (margin?.total_margin_3m ?? 0) < 0,
    };
  });

  // Merge: problem hubs (from Claude) + auto-keep hubs, sorted by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const hubs: HubSummaryItem[] = [...claudeHubs, ...autoKeepItems]
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

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
