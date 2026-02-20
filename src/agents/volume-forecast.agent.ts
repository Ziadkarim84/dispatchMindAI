import { AgentResult, HubDailyVolume, VolumeForecast } from '@common/types';
import { query } from '@database/connection';
import { runPrompt } from './base.agent';

const SYSTEM_PROMPT = `You are a logistics volume forecasting expert for RedX, a courier company in Bangladesh.
You will receive historical daily parcel delivery counts for a specific hub over the past 90 days.
Analyze the trend and return a JSON forecast.

Return ONLY a valid JSON object in this exact format (no markdown, no explanation):
{
  "predicted_daily_avg": <number>,
  "forecast_90d_total": <number>,
  "trend": "growing" | "shrinking" | "stable",
  "reasoning": "<brief explanation>"
}`;

async function fetchHubDailyVolume(hubId: number): Promise<HubDailyVolume[]> {
  return query<HubDailyVolume[]>(
    `SELECT hub_id, date, parcel_count
     FROM dm_hub_daily_volume
     WHERE hub_id = ?
       AND date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
     ORDER BY date ASC`,
    [hubId]
  );
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

export async function runVolumeForecastAgent(hubId: number): Promise<AgentResult<VolumeForecast>> {
  const history = await fetchHubDailyVolume(hubId);

  if (history.length === 0) {
    return {
      data: { hub_id: hubId, predicted_daily_avg: 0, trend: 'stable', forecast_90d_total: 0 },
      reasoning: 'No historical data available for this hub.',
      confidence: 0,
    };
  }

  const userPrompt = `Hub ID: ${hubId}
Historical daily parcel counts (last 90 days):
${JSON.stringify(history, null, 2)}

Based on this data, forecast the volume for the next 90 days.`;

  const raw = await runPrompt(SYSTEM_PROMPT, userPrompt);
  const parsed = parseClaudeJson<{
    predicted_daily_avg: number;
    forecast_90d_total: number;
    trend: 'growing' | 'shrinking' | 'stable';
    reasoning: string;
  }>(raw);

  return {
    data: {
      hub_id: hubId,
      predicted_daily_avg: parsed.predicted_daily_avg,
      forecast_90d_total: parsed.forecast_90d_total,
      trend: parsed.trend,
    },
    reasoning: parsed.reasoning,
    confidence: 80,
  };
}
