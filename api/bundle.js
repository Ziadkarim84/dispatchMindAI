"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/app.ts
var app_exports = {};
__export(app_exports, {
  createApp: () => createApp
});
module.exports = __toCommonJS(app_exports);
var import_express5 = __toESM(require("express"));
var import_cors = __toESM(require("cors"));
var import_helmet = __toESM(require("helmet"));

// src/config/env.validation.ts
var import_zod = require("zod");
var import_dotenv = __toESM(require("dotenv"));
import_dotenv.default.config();
var envSchema = import_zod.z.object({
  NODE_ENV: import_zod.z.enum(["development", "staging", "production"]).default("development"),
  PORT: import_zod.z.coerce.number().default(3e3),
  DB_HOST: import_zod.z.string().min(1),
  DB_PORT: import_zod.z.coerce.number().default(3306),
  DB_USER: import_zod.z.string().min(1),
  DB_PASSWORD: import_zod.z.string(),
  DB_NAME: import_zod.z.string().min(1),
  ANTHROPIC_API_KEY: import_zod.z.string().min(1),
  METABASE_SESSION_TOKEN: import_zod.z.string().optional(),
  METABASE_USER: import_zod.z.string().optional(),
  METABASE_PASS: import_zod.z.string().optional(),
  JWT_SECRET: import_zod.z.string().min(32).optional(),
  FRONTEND_URL: import_zod.z.string().url().optional(),
  LOG_LEVEL: import_zod.z.enum(["debug", "info", "warn", "error"]).default("info")
});
var parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  throw new Error(`Missing or invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
}
var env = parsed.data;

// src/config/app.config.ts
var ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /\.lovable\.app$/,
  /\.lovableproject\.com$/
];
var PRODUCTION_EXACT_ORIGINS = [
  "https://redx.com.bd",
  ...env.FRONTEND_URL ? [env.FRONTEND_URL] : []
];
function isOriginAllowed(origin) {
  if (!origin) return true;
  if (PRODUCTION_EXACT_ORIGINS.includes(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}
var appConfig = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  apiPrefix: "/api/v1",
  cors: {
    origin: (origin, cb) => {
      const allowed = isOriginAllowed(origin);
      cb(allowed ? null : new Error(`CORS: origin not allowed \u2014 ${origin}`), allowed);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }
};

// src/common/utils/logger.util.ts
var import_winston = __toESM(require("winston"));
var logFormat = import_winston.default.format.combine(
  import_winston.default.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  import_winston.default.format.errors({ stack: true }),
  import_winston.default.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
  })
);
var logger = import_winston.default.createLogger({
  level: env.LOG_LEVEL,
  format: logFormat,
  transports: [
    new import_winston.default.transports.Console({
      format: import_winston.default.format.combine(
        import_winston.default.format.colorize(),
        logFormat
      )
    })
  ]
});

// src/common/middleware/request-logger.middleware.ts
function requestLoggerMiddleware(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl}`, {
      statusCode: res.statusCode,
      durationMs: duration,
      ip: req.ip
    });
  });
  next();
}

// src/common/errors/base.error.ts
var BaseError = class extends Error {
  constructor(message, statusCode, code, isOperational = true, details) {
    super(message);
    this.message = message;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
};

// src/common/utils/response.util.ts
var import_crypto = require("crypto");
function buildMeta() {
  return {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    requestId: (0, import_crypto.randomUUID)()
  };
}
function sendSuccess(res, data, statusCode = 200) {
  const response = {
    success: true,
    data,
    meta: buildMeta()
  };
  return res.status(statusCode).json(response);
}
function sendCreated(res, data) {
  return sendSuccess(res, data, 201);
}
function sendError(res, code, message, statusCode = 500, details) {
  const response = {
    success: false,
    error: { code, message, ...details !== void 0 ? { details } : {} },
    meta: buildMeta()
  };
  return res.status(statusCode).json(response);
}

// src/common/middleware/error-handler.middleware.ts
function errorHandlerMiddleware(error, req, res, _next) {
  if (error instanceof BaseError) {
    if (!error.isOperational) {
      logger.error("Non-operational error", {
        message: error.message,
        stack: error.stack,
        code: error.code,
        path: req.path
      });
    }
    return sendError(res, error.code, error.message, error.statusCode, error.details);
  }
  logger.error("Unhandled error", {
    message: error.message,
    stack: error.stack,
    name: error.name,
    path: req.path,
    method: req.method
  });
  return sendError(res, "INTERNAL_SERVER_ERROR", "An unexpected error occurred", 500);
}

// src/common/middleware/not-found.middleware.ts
function notFoundMiddleware(req, res) {
  return sendError(res, "ROUTE_NOT_FOUND", `Route ${req.method} ${req.originalUrl} not found`, 404);
}

// src/modules/dispatch/dispatch.routes.ts
var import_express = require("express");

// src/common/errors/validation.error.ts
var ValidationError = class extends BaseError {
  constructor(message, details) {
    super(message, 400, "VALIDATION_ERROR", true, details);
  }
};

// src/modules/dispatch/dispatch.schema.ts
var import_zod2 = require("zod");
var dispatchRecommendSchema = import_zod2.z.object({
  hub_id: import_zod2.z.number().int().positive().optional(),
  area_id: import_zod2.z.number().int().positive(),
  parcel_value: import_zod2.z.number().positive(),
  weight: import_zod2.z.number().positive(),
  sla_days: import_zod2.z.number().int().min(1).default(3)
});

// src/database/connection.ts
var import_promise = __toESM(require("mysql2/promise"));

// src/config/database.config.ts
var databaseConfig = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
  timezone: "+06:00"
};

// src/database/connection.ts
var pool = import_promise.default.createPool(databaseConfig);
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// src/agents/base.agent.ts
var import_sdk = __toESM(require("@anthropic-ai/sdk"));
var client = new import_sdk.default({ apiKey: process.env.ANTHROPIC_API_KEY });
async function runPrompt(systemPrompt, userPrompt) {
  return runPromptWithOptions(systemPrompt, userPrompt, 2048);
}
async function runPromptWithOptions(systemPrompt, userPrompt, maxTokens) {
  logger.debug("Running Claude prompt", { systemLength: systemPrompt.length, userLength: userPrompt.length, maxTokens });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });
  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude");
  return content.text;
}

// src/agents/volume-forecast.agent.ts
var SYSTEM_PROMPT = `You are a logistics volume forecasting expert for RedX, a courier company in Bangladesh.
You will receive historical daily parcel delivery counts for a specific hub over the past 90 days.
Analyze the trend and return a JSON forecast.

Return ONLY a valid JSON object in this exact format (no markdown, no explanation):
{
  "predicted_daily_avg": <number>,
  "forecast_90d_total": <number>,
  "trend": "growing" | "shrinking" | "stable",
  "reasoning": "<brief explanation>"
}`;
async function fetchHubDailyVolume(hubId) {
  return query(
    `SELECT hub_id, date, parcel_count
     FROM dm_hub_daily_volume
     WHERE hub_id = ?
       AND date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
     ORDER BY date ASC`,
    [hubId]
  );
}
function parseClaudeJson(raw) {
  const cleaned = raw.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();
  const start = cleaned.search(/[{[]/);
  if (start === -1) throw new Error(`No JSON found in Claude response: ${cleaned.slice(0, 100)}`);
  const openChar = cleaned[start];
  const closeChar = openChar === "{" ? "}" : "]";
  const end = cleaned.lastIndexOf(closeChar);
  if (end === -1) throw new Error(`No closing ${closeChar} found in Claude response`);
  return JSON.parse(cleaned.slice(start, end + 1));
}
async function runVolumeForecastAgent(hubId) {
  const history = await fetchHubDailyVolume(hubId);
  if (history.length === 0) {
    return {
      data: { hub_id: hubId, predicted_daily_avg: 0, trend: "stable", forecast_90d_total: 0 },
      reasoning: "No historical data available for this hub.",
      confidence: 0
    };
  }
  const userPrompt = `Hub ID: ${hubId}
Historical daily parcel counts (last 90 days):
${JSON.stringify(history, null, 2)}

Based on this data, forecast the volume for the next 90 days.`;
  const raw = await runPrompt(SYSTEM_PROMPT, userPrompt);
  const parsed2 = parseClaudeJson(raw);
  return {
    data: {
      hub_id: hubId,
      predicted_daily_avg: parsed2.predicted_daily_avg,
      forecast_90d_total: parsed2.forecast_90d_total,
      trend: parsed2.trend
    },
    reasoning: parsed2.reasoning,
    confidence: 80
  };
}

// src/agents/cost-modeling.agent.ts
var SYSTEM_PROMPT2 = `You are a logistics cost and margin analyst for RedX, a courier company in Bangladesh.
You will receive per-hub revenue data, 4PL partner costs, fixed monthly hub costs, and the Shopup internal
variable cost per parcel (fuel, rider commission, sorting labour \u2014 provided in the input).
Calculate contribution margins for three dispatch scenarios: 3PL (internal RedX), 4PL (external partner), and Hybrid.

Margin formula per parcel:
- Revenue         = SHOPUP_CHARGE + SHOPUP_COD_CHARGE (delivered) OR SHOPUP_RETURN_CHARGE (returned)
- 3PL Variable    = shopup_internal_cost_per_parcel (internal handling, fuel, rider wages)
- 4PL Cost        = average charge paid to external partner per parcel
- Fixed Cost/parcel = monthly fixed costs / monthly parcel volume
- 3PL margin      = Revenue - 3PL_Variable - Fixed_Cost_per_parcel
- 4PL margin      = Revenue - 4PL_Cost - Fixed_Cost_per_parcel
- Hybrid margin   = Revenue - (0.5 \xD7 3PL_Variable + 0.5 \xD7 4PL_Cost) - Fixed_Cost_per_parcel
- margin_delta_vs_current: positive means this scenario is MORE profitable than current baseline

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "scenario": "3PL",
    "avg_revenue_per_parcel": <number>,
    "avg_cost_per_parcel": <number>,
    "avg_fixed_cost_per_parcel": <number>,
    "avg_margin_per_parcel": <number>,
    "margin_delta_vs_current": <number>,
    "reasoning": "<brief>"
  },
  { "scenario": "4PL", ... },
  { "scenario": "Hybrid", ... }
]`;
async function fetchHubMarginSummary(hubId) {
  const rows = await query(
    `SELECT
       hub_id,
       SUM(total_parcels)     AS total_parcels,
       SUM(delivered_parcels) AS delivered_parcels,
       SUM(returned_parcels)  AS returned_parcels,
       SUM(total_revenue)     AS total_revenue,
       SUM(total_4pl_cost)    AS total_4pl_cost,
       SUM(total_fixed_cost)  AS total_fixed_cost,
       ROUND(SUM(total_revenue - total_4pl_cost - total_fixed_cost)
         / NULLIF(SUM(total_parcels), 0), 2) AS avg_margin_per_parcel
     FROM dm_hub_contribution_margin
     WHERE hub_id = ?
       AND (year > YEAR(DATE_SUB(NOW(), INTERVAL 3 MONTH))
         OR (year = YEAR(DATE_SUB(NOW(), INTERVAL 3 MONTH))
             AND month >= MONTH(DATE_SUB(NOW(), INTERVAL 3 MONTH))))
     GROUP BY hub_id`,
    [hubId]
  );
  return rows[0] ?? null;
}
async function fetchHubFixedCosts(hubId) {
  const rows = await query(
    `SELECT * FROM dm_hub_monthly_costs
     WHERE hub_id = ? AND year = YEAR(NOW()) AND month = MONTH(NOW())
     LIMIT 1`,
    [hubId]
  );
  return rows[0] ?? null;
}
function parseClaudeJson2(raw) {
  const cleaned = raw.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();
  const start = cleaned.search(/[{[]/);
  if (start === -1) throw new Error(`No JSON found in Claude response: ${cleaned.slice(0, 100)}`);
  const openChar = cleaned[start];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error(`No closing ${closeChar} found in Claude response`);
  return JSON.parse(cleaned.slice(start, end + 1));
}
async function runCostModelingAgent(hubId, volumeForecast) {
  const [marginSummary, fixedCosts] = await Promise.all([
    fetchHubMarginSummary(hubId),
    fetchHubFixedCosts(hubId)
  ]);
  const shopupInternalCostPerParcel = Number(process.env.SHOPUP_INTERNAL_COST_PER_PARCEL ?? 20);
  const userPrompt = `Hub ID: ${hubId}
Monthly parcel volume (forecast): ${volumeForecast.predicted_daily_avg * 30} parcels/month
Shopup internal variable cost per parcel: BDT ${shopupInternalCostPerParcel} (rider wages, fuel, sorting)

Pre-aggregated hub margin summary (last 3 months):
${marginSummary ? JSON.stringify(marginSummary, null, 2) : "No aggregated data available \u2014 assume 0 revenue and costs"}

Hub fixed monthly costs (BDT):
${fixedCosts ? JSON.stringify(fixedCosts, null, 2) : "No fixed cost data available \u2014 assume 0"}

Calculate the contribution margin per parcel for 3PL, 4PL, and Hybrid scenarios.
Use the formulas in the system prompt. margin_delta_vs_current compares each scenario vs the 3PL baseline.`;
  const raw = await runPrompt(SYSTEM_PROMPT2, userPrompt);
  const parsed2 = parseClaudeJson2(raw);
  return {
    data: parsed2.map((s) => ({
      hub_id: hubId,
      scenario: s.scenario,
      avg_revenue_per_parcel: s.avg_revenue_per_parcel,
      avg_cost_per_parcel: s.avg_cost_per_parcel,
      avg_fixed_cost_per_parcel: s.avg_fixed_cost_per_parcel,
      avg_margin_per_parcel: s.avg_margin_per_parcel,
      margin_delta_vs_current: s.margin_delta_vs_current
    })),
    reasoning: parsed2.map((s) => `${s.scenario}: ${s.reasoning}`).join(" | "),
    confidence: 75
  };
}

// src/agents/sla-risk.agent.ts
var BASE_SYSTEM_PROMPT = `You are an SLA risk analyst for RedX, a courier company in Bangladesh.
You will receive historical delivery performance data per partner for a specific area.
Each partner entry already includes pre-computed breach_probability and risk_score values
derived from historical data and the merchant's SLA requirement.

Your role is to validate these computed scores and apply any operational context that
the raw numbers cannot capture (e.g., partner recently expanded capacity, new route opened,
known operational issues). If the data is sufficient and no anomalies exist, use the
provided computed values directly.

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "partner_id": <number>,
    "partner_name": "<string>",
    "area_id": <number>,
    "breach_probability": <0-100>,
    "risk_score": <0-100>,
    "risk_level": "LOW" | "MEDIUM" | "HIGH",
    "reasoning": "<brief \u2014 note if computed values were used as-is or adjusted>"
  }
]`;
async function fetchPartnerSlaStats(areaId) {
  return query(
    `SELECT
       partner_id,
       partner_name,
       area_id,
       SUM(total_deliveries) AS total_deliveries,
       SUM(late_deliveries)  AS late_deliveries,
       ROUND(SUM(late_deliveries) * 100.0 / NULLIF(SUM(total_deliveries), 0), 2) AS breach_rate
     FROM dm_partner_sla_performance
     WHERE area_id = ?
       AND (year > YEAR(DATE_SUB(NOW(), INTERVAL 3 MONTH))
         OR (year = YEAR(DATE_SUB(NOW(), INTERVAL 3 MONTH))
             AND month >= MONTH(DATE_SUB(NOW(), INTERVAL 3 MONTH))))
     GROUP BY partner_id, partner_name, area_id
     HAVING total_deliveries > 0`,
    [areaId]
  );
}
function getRiskThresholds(slaDays) {
  if (slaDays <= 1) return { low: 5, medium: 15 };
  if (slaDays === 2) return { low: 10, medium: 25 };
  if (slaDays <= 3) return { low: 15, medium: 35 };
  if (slaDays <= 5) return { low: 20, medium: 40 };
  return { low: 25, medium: 50 };
}
function parseClaudeJson3(raw) {
  const cleaned = raw.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();
  const start = cleaned.search(/[{[]/);
  if (start === -1) throw new Error(`No JSON found in Claude response: ${cleaned.slice(0, 100)}`);
  const openChar = cleaned[start];
  const closeChar = openChar === "{" ? "}" : "]";
  const end = cleaned.lastIndexOf(closeChar);
  if (end === -1) throw new Error(`No closing ${closeChar} found in Claude response`);
  return JSON.parse(cleaned.slice(start, end + 1));
}
function computeBreachProbability(historicalBreachRate, merchantSlaDays, totalDeliveries, hubSlaDays = 3) {
  let adjusted = historicalBreachRate;
  if (merchantSlaDays < hubSlaDays) {
    adjusted = Math.min(100, historicalBreachRate * (hubSlaDays / merchantSlaDays));
  } else if (merchantSlaDays > hubSlaDays) {
    adjusted = historicalBreachRate * 0.7;
  }
  const samplePenalty = totalDeliveries < 30 ? Math.round(20 * (1 - totalDeliveries / 30)) : 0;
  return Math.min(100, Math.round(adjusted + samplePenalty));
}
function computeRiskScore(breachProbability, thresholds) {
  if (breachProbability <= thresholds.low) {
    return Math.round(breachProbability / Math.max(thresholds.low, 1) * 30);
  } else if (breachProbability <= thresholds.medium) {
    const ratio = (breachProbability - thresholds.low) / Math.max(thresholds.medium - thresholds.low, 1);
    return Math.round(30 + ratio * 30);
  } else {
    const ratio = Math.min(
      1,
      (breachProbability - thresholds.medium) / Math.max(100 - thresholds.medium, 1)
    );
    return Math.round(60 + ratio * 40);
  }
}
async function runSlaRiskAgent(areaId, slaDays = 3) {
  logger.debug("[SlaRiskAgent] Fetching partner SLA stats", { areaId });
  let stats;
  try {
    stats = await fetchPartnerSlaStats(areaId);
    logger.debug("[SlaRiskAgent] DB query complete", { areaId, rowCount: stats.length, rows: stats });
  } catch (err) {
    logger.error("[SlaRiskAgent] DB query failed", {
      areaId,
      message: err.message,
      stack: err.stack
    });
    throw err;
  }
  if (stats.length === 0) {
    logger.warn("[SlaRiskAgent] No delivery data found for area", { areaId });
    return {
      data: [],
      reasoning: "No delivery data found for this area.",
      confidence: 0
    };
  }
  const thresholds = getRiskThresholds(slaDays);
  const statsWithComputed = stats.map((s) => ({
    ...s,
    computed_breach_probability: computeBreachProbability(
      Number(s.breach_rate),
      slaDays,
      Number(s.total_deliveries)
    ),
    computed_risk_score: computeRiskScore(
      computeBreachProbability(Number(s.breach_rate), slaDays, Number(s.total_deliveries)),
      thresholds
    )
  }));
  const systemPrompt = `${BASE_SYSTEM_PROMPT}
Risk thresholds (merchant SLA = ${slaDays} day${slaDays !== 1 ? "s" : ""}):
breach_probability < ${thresholds.low}% \u2192 LOW | ${thresholds.low}\u2013${thresholds.medium}% \u2192 MEDIUM | > ${thresholds.medium}% \u2192 HIGH.`;
  const userPrompt = `Area ID: ${areaId}
Merchant required SLA: ${slaDays} day${slaDays !== 1 ? "s" : ""} (hub standard SLA: 3 days)

Partner performance data with pre-computed scores (last 90 days):
${JSON.stringify(statsWithComputed, null, 2)}

The computed_breach_probability and computed_risk_score have been calculated mathematically
from historical data, adjusting for the merchant's SLA requirement and sample size.
Validate these scores and return them as breach_probability/risk_score unless you have
specific operational context that warrants an adjustment.`;
  logger.debug("[SlaRiskAgent] Calling Claude", { slaDays, thresholds });
  let raw;
  try {
    raw = await runPrompt(systemPrompt, userPrompt);
    logger.debug("[SlaRiskAgent] Claude raw response", { raw });
  } catch (err) {
    logger.error("[SlaRiskAgent] Claude call failed", {
      message: err.message,
      stack: err.stack
    });
    throw err;
  }
  let parsed2;
  try {
    parsed2 = parseClaudeJson3(raw);
  } catch (err) {
    logger.error("[SlaRiskAgent] JSON parse failed", { raw, message: err.message });
    throw err;
  }
  return {
    data: parsed2.map((r) => ({
      partner_id: r.partner_id,
      partner_name: r.partner_name,
      area_id: r.area_id,
      breach_probability: r.breach_probability,
      risk_score: r.risk_score,
      risk_level: r.risk_level
    })),
    reasoning: parsed2.map((r) => `${r.partner_name}: ${r.reasoning}`).join(" | "),
    confidence: 78
  };
}

// src/agents/partner-evaluation.agent.ts
var SYSTEM_PROMPT3 = `You are a delivery partner selection expert for RedX, a courier company in Bangladesh.
You will receive a pre-ranked list of 4PL partners with a composite_score that combines
SLA risk (60% weight) and cost (40% weight). Lower score = better partner.

Selection guidance:
- The top-ranked partner (lowest composite_score) is typically optimal
- Override the ranking only if you have specific operational reasons (e.g., partner known to have
  capacity issues, pricing mismatch, or an operational anomaly not reflected in historical data)
- backup_partner should be the second-ranked partner by composite_score
- If no partners are available or the top partner has sla_risk_score > 80, return optimal_partner_id: 0
- sla_risk_score in your response should reflect the selected partner's risk level

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "optimal_partner_id": <number \u2014 must be one of the listed partner IDs, or 0 if none suitable>,
  "optimal_partner_name": "<string>",
  "confidence": <0-100>,
  "backup_partner_id": <number | null>,
  "backup_partner_name": "<string | null>",
  "sla_risk_score": <0-100>,
  "reasoning": "<brief \u2014 note if pre-computed ranking was used as-is or overridden>"
}`;
async function fetchAvailablePartners(areaId) {
  return query(
    `SELECT
       dp.ID                                                    AS partner_id,
       dp.NAME                                                  AS partner_name,
       dp.TYPE                                                  AS type,
       CASE
         WHEN a.ZONE_ID = 1 THEN 'ISD'
         WHEN a.ZONE_ID = 2 THEN 'SUB'
         ELSE 'OSD'
       END                                                      AS zone_name,
       pp.kg05_price,
       pp.kg1_price,
       pp.kg2_price,
       pp.kg3_price,
       pp.kg4_price,
       pp.kg5_price,
       pp.extended_per_kg,
       pp.cod_percentage,
       pp.return_charge
     FROM sl_area_partners ap
     JOIN sl_delivery_partners dp ON dp.ID = ap.PARTNER_ID
     JOIN sl_areas a ON a.ID = ap.AREA_ID
     LEFT JOIN sl_fourpl_partner_pricing pp
       ON pp.partner_id = dp.ID
       AND pp.zone_id = CASE
         WHEN a.ZONE_ID = 1 THEN 1
         WHEN a.ZONE_ID = 2 THEN 2
         ELSE 3
       END
       AND pp.status = 'active'
     WHERE ap.AREA_ID = ?
       AND ap.STATUS = 'active'
       AND dp.ID != 3`,
    [areaId]
  );
}
function computePartnerCost(partner, weightGrams, parcelValue) {
  if (partner.kg1_price === null) return null;
  let deliveryCharge;
  if (weightGrams <= 500) deliveryCharge = partner.kg05_price;
  else if (weightGrams <= 1e3) deliveryCharge = partner.kg1_price;
  else if (weightGrams <= 2e3) deliveryCharge = partner.kg2_price;
  else if (weightGrams <= 3e3) deliveryCharge = partner.kg3_price;
  else if (weightGrams <= 4e3) deliveryCharge = partner.kg4_price;
  else if (weightGrams <= 5e3) deliveryCharge = partner.kg5_price;
  else {
    const extraKg = Math.ceil((weightGrams - 5e3) / 1e3);
    deliveryCharge = partner.kg5_price + extraKg * (partner.extended_per_kg ?? 0);
  }
  const codFee = Math.round(parcelValue * (partner.cod_percentage ?? 0) / 100);
  return {
    delivery_charge: Math.round(deliveryCharge),
    cod_fee: codFee,
    total_cost: Math.round(deliveryCharge) + codFee
  };
}
function parseClaudeJson4(raw) {
  const cleaned = raw.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();
  const start = cleaned.search(/[{[]/);
  if (start === -1) throw new Error(`No JSON found in Claude response: ${cleaned.slice(0, 100)}`);
  const openChar = cleaned[start];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error(`No closing ${closeChar} found in Claude response`);
  return JSON.parse(cleaned.slice(start, end + 1));
}
function computeCompositeScore(riskScore, totalCost, maxCost) {
  const normalisedCost = maxCost > 0 ? totalCost / maxCost * 100 : 0;
  return Math.round(0.6 * riskScore + 0.4 * normalisedCost);
}
async function runPartnerEvaluationAgent(areaId, slaRisks, costModels, weightGrams, parcelValue) {
  logger.debug("[PartnerEvaluationAgent] Fetching available partners with pricing", { areaId, weightGrams, parcelValue });
  let availablePartners;
  try {
    availablePartners = await fetchAvailablePartners(areaId);
    logger.debug("[PartnerEvaluationAgent] DB query complete", { areaId, partners: availablePartners });
  } catch (err) {
    logger.error("[PartnerEvaluationAgent] DB query failed", {
      areaId,
      message: err.message,
      stack: err.stack
    });
    throw err;
  }
  const fourplPartnersWithCost = availablePartners.map((p) => {
    const cost = computePartnerCost(p, weightGrams, parcelValue);
    return {
      ...p,
      // Drop raw weight-tier columns — replaced by the computed values below
      kg05_price: void 0,
      kg1_price: void 0,
      kg2_price: void 0,
      kg3_price: void 0,
      kg4_price: void 0,
      kg5_price: void 0,
      extended_per_kg: void 0,
      computed_delivery_charge: cost?.delivery_charge ?? null,
      computed_cod_fee: cost?.cod_fee ?? null,
      computed_total_cost: cost?.total_cost ?? null
    };
  });
  const partnersWithCost = fourplPartnersWithCost.filter((p) => p.computed_total_cost !== null);
  const partnersWithoutCost = fourplPartnersWithCost.filter((p) => p.computed_total_cost === null);
  const maxCost = Math.max(...partnersWithCost.map((p) => p.computed_total_cost), 1);
  const rankedPartners = partnersWithCost.map((p) => {
    const slaRisk = slaRisks.find((r) => r.partner_id === p.partner_id);
    const riskScore = slaRisk?.risk_score ?? 75;
    const composite = computeCompositeScore(riskScore, p.computed_total_cost, maxCost);
    return { ...p, sla_risk_score: riskScore, composite_score: composite };
  }).sort((a, b) => a.composite_score - b.composite_score);
  const userPrompt = `Area ID: ${areaId}
Parcel: ${weightGrams}g, value BDT ${parcelValue}

Pre-ranked 4PL partners (composite_score = 60% SLA risk + 40% cost, lower = better):
${JSON.stringify(rankedPartners, null, 2)}

Partners without pricing data (excluded from ranking):
${JSON.stringify(partnersWithoutCost, null, 2)}

Hub-level cost modeling (strategic context):
${JSON.stringify(costModels, null, 2)}

Select from the ranked list above. The lowest composite_score partner is recommended unless
you have operational reasons to override. Return optimal_partner_id: 0 only if the top
partner has sla_risk_score > 80 or no partners are listed.`;
  logger.debug("[PartnerEvaluationAgent] Calling Claude", { areaId, partnerCount: availablePartners.length + 1 });
  let raw;
  try {
    raw = await runPrompt(SYSTEM_PROMPT3, userPrompt);
    logger.debug("[PartnerEvaluationAgent] Claude raw response", { raw });
  } catch (err) {
    logger.error("[PartnerEvaluationAgent] Claude call failed", {
      message: err.message,
      stack: err.stack
    });
    throw err;
  }
  let parsed2;
  try {
    parsed2 = parseClaudeJson4(raw);
  } catch (err) {
    logger.error("[PartnerEvaluationAgent] JSON parse failed", { raw, message: err.message });
    throw err;
  }
  return {
    data: {
      optimal_partner_id: parsed2.optimal_partner_id,
      optimal_partner_name: parsed2.optimal_partner_name,
      confidence: parsed2.confidence,
      backup_partner_id: parsed2.backup_partner_id,
      backup_partner_name: parsed2.backup_partner_name,
      sla_risk_score: parsed2.sla_risk_score
    },
    reasoning: parsed2.reasoning,
    confidence: parsed2.confidence
  };
}

// src/agents/executive-summary.agent.ts
var SYSTEM_PROMPT4 = `You are an executive operations advisor for RedX, a courier company in Bangladesh.
You will receive analysis from multiple AI agents about a dispatch decision for a hub/area.
Write a concise, human-readable decision report for operations managers.

Your report must include:
1. Recommended dispatch type (3PL or 4PL) and partner
2. Key reason for the recommendation
3. Expected margin impact (BDT per parcel)
4. SLA risk level and main risk factor
5. One actionable next step

Keep it under 150 words. Write in plain English, no jargon. Return plain text (no JSON, no markdown).`;
async function runExecutiveSummaryAgent(input) {
  const { hubId, areaId, weightGrams, parcelValue, slaDays, volumeForecast, costModels, slaRisks, partnerRanking, dispatchType } = input;
  const recommendedCost = costModels.find((c) => c.scenario === (dispatchType === "4PL" ? "4PL" : "3PL"));
  const topRisk = slaRisks.sort((a, b) => b.risk_score - a.risk_score)[0];
  const userPrompt = `Hub: ${hubId} | Area: ${areaId}
Parcel: ${weightGrams}g, value BDT ${parcelValue}, required SLA: ${slaDays} day${slaDays !== 1 ? "s" : ""}
Dispatch decision: ${dispatchType}
Recommended partner: ${partnerRanking.optimal_partner_name} (confidence: ${partnerRanking.confidence}%)
Backup partner: ${partnerRanking.backup_partner_name ?? "None"}

Volume forecast:
- Daily avg: ${volumeForecast.predicted_daily_avg} parcels/day
- 90-day total: ${volumeForecast.forecast_90d_total} parcels
- Trend: ${volumeForecast.trend}

Margin analysis (${dispatchType} scenario):
- Avg margin per parcel: BDT ${recommendedCost?.avg_margin_per_parcel ?? "N/A"}
- Delta vs current: BDT ${recommendedCost?.margin_delta_vs_current ?? "N/A"}

Top SLA risk:
- Partner: ${topRisk?.partner_name ?? "N/A"}
- Risk level: ${topRisk?.risk_level ?? "N/A"}
- Breach probability: ${topRisk?.breach_probability ?? "N/A"}%

Write the executive summary report now.`;
  const summary = await runPrompt(SYSTEM_PROMPT4, userPrompt);
  return {
    data: summary.trim(),
    reasoning: "Generated by synthesizing volume, cost, SLA, and partner evaluation data.",
    confidence: partnerRanking.confidence
  };
}

// src/common/errors/not-found.error.ts
var NotFoundError = class extends BaseError {
  constructor(resource, identifier) {
    super(`${resource} with ID ${identifier} not found`, 404, "NOT_FOUND");
  }
};

// src/modules/dispatch/dispatch.service.ts
async function deriveHubId(areaId) {
  const rows = await query(
    `SELECT HUB_ID FROM sl_area_hub WHERE AREA_ID = ? AND STATUS = 'active' LIMIT 1`,
    [areaId]
  );
  if (rows.length === 0) {
    throw new NotFoundError("Hub", `area_id=${areaId} (no active hub mapping found)`);
  }
  return rows[0].HUB_ID;
}
async function validateHubAreaMapping(hubId, areaId) {
  const rows = await query(
    `SELECT STATUS FROM sl_area_hub WHERE HUB_ID = ? AND AREA_ID = ? LIMIT 1`,
    [hubId, areaId]
  );
  if (rows.length === 0) {
    logger.warn("Hub-area combination not found in sl_area_hub", { hubId, areaId });
    return false;
  }
  if (rows[0].STATUS !== "active") {
    logger.warn("Hub-area combination is not active", { hubId, areaId, status: rows[0].STATUS });
    return false;
  }
  return true;
}
var dispatchHistory = [];
async function getDispatchRecommendation(input) {
  const { hub_id, area_id, weight, parcel_value, sla_days } = input;
  const weightGrams = Math.round(weight * 1e3);
  const resolvedHubId = hub_id ?? await deriveHubId(area_id);
  logger.info("Starting dispatch recommendation", { hub_id: resolvedHubId, area_id, weightGrams, parcel_value, sla_days });
  const isValidMapping = hub_id != null ? await validateHubAreaMapping(hub_id, area_id) : true;
  if (!isValidMapping) {
    logger.warn("Proceeding with dispatch despite inactive/missing hub-area mapping", { hub_id: resolvedHubId, area_id });
  }
  logger.debug("Running volume forecast agent", { hub_id: resolvedHubId });
  const volumeResult = await runVolumeForecastAgent(resolvedHubId);
  logger.debug("Running cost modeling agent", { hub_id: resolvedHubId });
  const costResult = await runCostModelingAgent(resolvedHubId, volumeResult.data);
  logger.debug("Running SLA risk agent", { area_id, sla_days });
  const slaResult = await runSlaRiskAgent(area_id, sla_days);
  logger.debug("Running partner evaluation agent", { area_id, weightGrams, parcel_value });
  const partnerResult = await runPartnerEvaluationAgent(
    area_id,
    slaResult.data,
    costResult.data,
    weightGrams,
    parcel_value
  );
  const fourPlModel = costResult.data.find((c) => c.scenario === "4PL");
  const threePlModel = costResult.data.find((c) => c.scenario === "3PL");
  const slaRiskScore = partnerResult.data.sla_risk_score;
  const optimalPartnerId = partnerResult.data.optimal_partner_id;
  const fourPlMarginDelta = fourPlModel?.margin_delta_vs_current ?? -1;
  const use4PL = fourPlMarginDelta > 0 && slaRiskScore < 60 && typeof optimalPartnerId === "number" && optimalPartnerId > 0 && optimalPartnerId !== 3;
  logger.info("Dispatch decision factors", { slaRiskScore, optimalPartnerId, use4PL });
  const dispatchType = use4PL ? "4PL" : "3PL";
  const partnerName = use4PL ? partnerResult.data.optimal_partner_name : "Shopup (Internal)";
  const expectedMargin = use4PL ? fourPlModel?.avg_margin_per_parcel ?? 0 : threePlModel?.avg_margin_per_parcel ?? 0;
  logger.debug("Running executive summary agent");
  const summaryResult = await runExecutiveSummaryAgent({
    hubId: resolvedHubId,
    areaId: area_id,
    weightGrams,
    parcelValue: parcel_value,
    slaDays: sla_days,
    volumeForecast: volumeResult.data,
    costModels: costResult.data,
    slaRisks: slaResult.data,
    partnerRanking: partnerResult.data,
    dispatchType
  });
  const decision = {
    type: dispatchType,
    partner: partnerName,
    expected_margin: expectedMargin,
    risk_score: slaRiskScore,
    confidence: partnerResult.data.confidence,
    summary: summaryResult.data
  };
  dispatchHistory.push({ ...decision, hub_id: resolvedHubId, area_id, decided_at: (/* @__PURE__ */ new Date()).toISOString() });
  if (dispatchHistory.length > 200) dispatchHistory.shift();
  logger.info("Dispatch recommendation complete", { hub_id: resolvedHubId, area_id, dispatchType, partnerName });
  return decision;
}

// src/modules/dispatch/dispatch.controller.ts
async function recommendDispatch(req, res, next) {
  try {
    const parsed2 = dispatchRecommendSchema.safeParse(req.body);
    if (!parsed2.success) throw new ValidationError("Invalid request body", parsed2.error.flatten());
    const decision = await getDispatchRecommendation(parsed2.data);
    sendSuccess(res, decision);
  } catch (err) {
    next(err);
  }
}
async function getDispatchHistory(_req, res, next) {
  try {
    sendSuccess(res, dispatchHistory.slice(-50).reverse());
  } catch (err) {
    next(err);
  }
}

// src/modules/dispatch/dispatch.routes.ts
var router = (0, import_express.Router)();
router.post("/recommend", recommendDispatch);
router.get("/history", getDispatchHistory);

// src/modules/partners/partners.routes.ts
var import_express2 = require("express");

// src/modules/partners/partners.schema.ts
var import_zod3 = require("zod");
var partnerOptimizeSchema = import_zod3.z.object({
  area_id: import_zod3.z.coerce.number().int().positive()
});

// src/modules/partners/partners.service.ts
async function deriveHubId2(areaId) {
  const rows = await query(
    `SELECT HUB_ID FROM sl_area_hub WHERE AREA_ID = ? AND STATUS = 'active' LIMIT 1`,
    [areaId]
  );
  if (rows.length === 0) {
    throw new NotFoundError("Hub", `area_id=${areaId} (no active hub mapping found)`);
  }
  return rows[0].HUB_ID;
}
async function getOptimalPartner(input) {
  const { area_id } = input;
  const hub_id = await deriveHubId2(area_id);
  logger.info("Derived hub_id from area", { area_id, hub_id });
  logger.info("Starting partner optimization", { area_id, hub_id });
  let volumeResult, slaResult;
  try {
    logger.debug("Running volume forecast + SLA risk agents in parallel", { hub_id, area_id });
    [volumeResult, slaResult] = await Promise.all([
      runVolumeForecastAgent(hub_id),
      runSlaRiskAgent(area_id, 3)
      // default 3-day SLA for general partner optimization
    ]);
    logger.debug("Volume forecast complete", { hub_id, forecast: volumeResult.data });
    logger.debug("SLA risk complete", { area_id, risks: slaResult.data });
  } catch (err) {
    logger.error("Failed in volume forecast or SLA risk agent", {
      hub_id,
      area_id,
      message: err.message,
      stack: err.stack
    });
    throw err;
  }
  let costResult;
  try {
    logger.debug("Running cost modeling agent", { hub_id });
    costResult = await runCostModelingAgent(hub_id, volumeResult.data);
    logger.debug("Cost modeling complete", { hub_id, models: costResult.data });
  } catch (err) {
    logger.error("Failed in cost modeling agent", {
      hub_id,
      message: err.message,
      stack: err.stack
    });
    throw err;
  }
  let partnerResult;
  try {
    logger.debug("Running partner evaluation agent", { area_id });
    partnerResult = await runPartnerEvaluationAgent(
      area_id,
      slaResult.data,
      costResult.data,
      1e3,
      // weight: 1000g (most common tier)
      1e3
      // parcel_value: BDT 1000 (typical BD e-commerce order)
    );
    logger.debug("Partner evaluation complete", { area_id, ranking: partnerResult.data });
  } catch (err) {
    logger.error("Failed in partner evaluation agent", {
      area_id,
      message: err.message,
      stack: err.stack
    });
    throw err;
  }
  logger.info("Partner optimization complete", {
    area_id,
    optimal: partnerResult.data.optimal_partner_name,
    confidence: partnerResult.data.confidence,
    sla_risk_score: partnerResult.data.sla_risk_score
  });
  return partnerResult.data;
}

// src/modules/partners/partners.controller.ts
async function optimizePartner(req, res, next) {
  try {
    const parsed2 = partnerOptimizeSchema.safeParse(req.query);
    if (!parsed2.success) throw new ValidationError("Invalid query params", parsed2.error.flatten());
    const ranking = await getOptimalPartner(parsed2.data);
    sendSuccess(res, ranking);
  } catch (err) {
    next(err);
  }
}

// src/modules/partners/partners.routes.ts
var router2 = (0, import_express2.Router)();
router2.get("/optimize", optimizePartner);

// src/modules/hubs/hubs.routes.ts
var import_express3 = require("express");

// src/modules/hubs/hubs.schema.ts
var import_zod4 = require("zod");
var hubParamsSchema = import_zod4.z.object({
  hubId: import_zod4.z.coerce.number().int().positive()
});
var hubCostQuerySchema = import_zod4.z.object({
  year: import_zod4.z.coerce.number().int().min(2020).optional(),
  month: import_zod4.z.coerce.number().int().min(1).max(12).optional()
});
var hubCostBodySchema = import_zod4.z.object({
  year: import_zod4.z.number().int().min(2020),
  month: import_zod4.z.number().int().min(1).max(12),
  rent: import_zod4.z.number().min(0).default(0),
  employee_cost: import_zod4.z.number().min(0).default(0),
  utility_cost: import_zod4.z.number().min(0).default(0),
  maintenance_cost: import_zod4.z.number().min(0).default(0),
  other_cost: import_zod4.z.number().min(0).default(0),
  notes: import_zod4.z.string().optional()
});
var assignPartnersBodySchema = import_zod4.z.object({
  assignments: import_zod4.z.array(
    import_zod4.z.object({
      area_id: import_zod4.z.number().int().positive(),
      partner_id: import_zod4.z.number().int().positive()
    })
  ).min(1)
});

// src/agents/network-strategy.agent.ts
var PROFITABILITY_SYSTEM_PROMPT = `You are a logistics network strategy expert for RedX, a courier company in Bangladesh.
You will receive hub operational data, volume forecasts, cost/margin analysis, and a PRE-CALCULATED
projected 90-day margin. Use the pre-calculated value exactly \u2014 do not recompute it.
Recommend whether to keep, close, or convert this hub to 4PL-only.

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "recommendation": "keep" | "close" | "convert",
  "risk_score": <0-100>,
  "reasoning": "<brief explanation>"
}`;
var MODEL_ADVISOR_SYSTEM_PROMPT = `You are a hub model optimization advisor for RedX, a courier company in Bangladesh.
You will receive hub performance data and cost scenarios for 3PL-only, 4PL-only, and Hybrid models.
Recommend the optimal operating model for this hub.

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "recommended_model": "3PL" | "4PL" | "Hybrid",
  "margin_uplift": <number in BDT per parcel vs current>,
  "risk_score": <0-100>,
  "confidence": <0-100>,
  "projected_profitability_90d": <number in BDT>,
  "reasoning": "<brief explanation>"
}`;
async function fetchHubAggregate(hubId) {
  const rows = await query(
    `SELECT
       r.HUB_ID                                              AS hub_id,
       h.HUB_NAME                                           AS hub_name,
       COUNT(*)                                              AS total_parcels,
       SUM(CASE WHEN p.PARTNER_ID IS NOT NULL THEN 1 ELSE 0 END) AS fourpl_parcels,
       ROUND(
         SUM(CASE WHEN p.PARTNER_ID IS NOT NULL THEN 1 ELSE 0 END)
         * 100.0 / COUNT(*), 2
       )                                                     AS fourpl_ratio,
       SUM(
         CASE
           WHEN p.STATUS IN (
             'delivered','cash-received','delivery-payment-collected',
             'delivery-payment-sent','hub-payment-collected'
           ) THEN COALESCE(p.SHOPUP_CHARGE, 0) + COALESCE(p.SHOPUP_COD_CHARGE, 0)
           WHEN p.STATUS IN ('shopup-returning', 'shopup-returned')
             THEN COALESCE(p.SHOPUP_RETURN_CHARGE, 0)
           ELSE 0
         END
       )                                                     AS total_revenue
     FROM sl_parcels p
     JOIN sl_logistics_parcel_routes r
       ON r.PARCEL_ID = p.ID AND r.HUB_ROLE = 'delivery'
     JOIN sl_hubs h ON h.ID = r.HUB_ID
     WHERE r.HUB_ID = ?
       AND p.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
     GROUP BY r.HUB_ID, h.HUB_NAME`,
    [hubId]
  );
  return rows[0] ?? null;
}
async function fetchHubConfig(hubId) {
  const rows = await query(
    `SELECT
       ID          AS hub_id,
       HUB_NAME    AS hub_name,
       HUB_TYPE    AS hub_type,
       IS_MH       AS is_mh,
       IS_RMH      AS is_rmh,
       SLA_TIER    AS sla_tier,
       SLA_TARGET  AS sla_target
     FROM sl_hubs
     WHERE ID = ?`,
    [hubId]
  );
  return rows[0] ?? null;
}
async function fetchHubAreas(hubId) {
  return query(
    `SELECT AREA_ID AS area_id, STATUS AS status FROM sl_area_hub WHERE HUB_ID = ? ORDER BY STATUS`,
    [hubId]
  );
}
async function fetchHubMonthlyCosts(hubId) {
  const rows = await query(
    `SELECT
       COALESCE(SUM(rent + employee_cost + utility_cost + maintenance_cost + other_cost), 0)
         AS total_fixed_cost
     FROM dm_hub_monthly_costs
     WHERE hub_id = ? AND year = YEAR(NOW()) AND month = MONTH(NOW())`,
    [hubId]
  );
  return rows[0]?.total_fixed_cost ?? 0;
}
function parseClaudeJson5(raw) {
  const cleaned = raw.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();
  const start = cleaned.search(/[{[]/);
  if (start === -1) throw new Error(`No JSON found in Claude response: ${cleaned.slice(0, 100)}`);
  const openChar = cleaned[start];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0, inString = false, escape = false, end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error(`No closing ${closeChar} found in Claude response`);
  return JSON.parse(cleaned.slice(start, end + 1));
}
async function runNetworkStrategyAgent(hubId, volumeForecast, costModels) {
  const [aggregate, hubConfig, totalFixedCost, hubAreas] = await Promise.all([
    fetchHubAggregate(hubId),
    fetchHubConfig(hubId),
    fetchHubMonthlyCosts(hubId),
    fetchHubAreas(hubId)
  ]);
  const activeAreas = hubAreas.filter((a) => a.status === "active").length;
  const avgRevenuePerParcel = costModels.find((c) => c.scenario === "3PL")?.avg_revenue_per_parcel ?? 0;
  const projected_margin_90d = Math.round(
    volumeForecast.forecast_90d_total * avgRevenuePerParcel - totalFixedCost * 3
  );
  const userPrompt = `Hub ID: ${hubId}

Hub configuration:
${JSON.stringify(hubConfig, null, 2)}

Areas served by this hub: ${hubAreas.length} total (${activeAreas} active)

Last 90 days operational summary:
${JSON.stringify(aggregate, null, 2)}

Monthly fixed costs (BDT): ${totalFixedCost}
Fixed costs over 90 days (BDT): ${totalFixedCost * 3}

Volume forecast (next 90 days): ${volumeForecast.forecast_90d_total} parcels (${volumeForecast.trend} trend)
Avg revenue per parcel (BDT): ${avgRevenuePerParcel}

PRE-CALCULATED projected 90-day margin (BDT): ${projected_margin_90d}
Formula: (${volumeForecast.forecast_90d_total} parcels \xD7 BDT ${avgRevenuePerParcel}) - BDT ${totalFixedCost * 3} fixed costs = BDT ${projected_margin_90d}

Margin scenarios:
${JSON.stringify(costModels, null, 2)}

Should this hub be kept open (3PL), closed, or converted to 4PL-only?
Use the pre-calculated projected_margin_90d of ${projected_margin_90d} BDT in your response.`;
  const raw = await runPrompt(PROFITABILITY_SYSTEM_PROMPT, userPrompt);
  const parsed2 = parseClaudeJson5(raw);
  return {
    data: {
      hub_id: hubId,
      recommendation: parsed2.recommendation,
      projected_margin_90d,
      risk_score: parsed2.risk_score
    },
    reasoning: parsed2.reasoning,
    confidence: 72
  };
}
async function runHubModelAdvisorAgent(hubId, volumeForecast, costModels) {
  const [aggregate, hubConfig, totalFixedCost, hubAreas] = await Promise.all([
    fetchHubAggregate(hubId),
    fetchHubConfig(hubId),
    fetchHubMonthlyCosts(hubId),
    fetchHubAreas(hubId)
  ]);
  const activeAreas = hubAreas.filter((a) => a.status === "active").length;
  const avgRevenuePerParcelAdvisor = costModels.find((c) => c.scenario === "3PL")?.avg_revenue_per_parcel ?? 0;
  const projected_profitability_90d = Math.round(
    volumeForecast.forecast_90d_total * avgRevenuePerParcelAdvisor - totalFixedCost * 3
  );
  const fourPlModel = costModels.find((c) => c.scenario === "4PL");
  const hybridModel = costModels.find((c) => c.scenario === "Hybrid");
  const userPrompt = `Hub ID: ${hubId}

Hub configuration:
${JSON.stringify(hubConfig, null, 2)}

Areas served by this hub: ${hubAreas.length} total (${activeAreas} active)

Last 90 days operational summary:
${JSON.stringify(aggregate, null, 2)}

Monthly fixed costs (BDT): ${totalFixedCost}
Fixed costs over 90 days (BDT): ${totalFixedCost * 3}

Volume forecast (next 90 days): ${volumeForecast.forecast_90d_total} parcels (${volumeForecast.trend} trend)

PRE-CALCULATED 90-day profitability by model:
- 3PL (current): BDT ${projected_profitability_90d}
- 4PL: BDT ${Math.round(projected_profitability_90d + (fourPlModel?.margin_delta_vs_current ?? 0) * volumeForecast.forecast_90d_total)}
- Hybrid: BDT ${Math.round(projected_profitability_90d + (hybridModel?.margin_delta_vs_current ?? 0) * volumeForecast.forecast_90d_total)}

Cost and margin scenarios (3PL / 4PL / Hybrid):
${JSON.stringify(costModels, null, 2)}

Recommend the optimal operating model (3PL-only, 4PL-only, or Hybrid) for this hub.
Use the pre-calculated projected_profitability_90d values above in your response.`;
  const raw = await runPrompt(MODEL_ADVISOR_SYSTEM_PROMPT, userPrompt);
  const parsed2 = parseClaudeJson5(raw);
  const recommended_90d = parsed2.recommended_model === "4PL" ? Math.round(projected_profitability_90d + (fourPlModel?.margin_delta_vs_current ?? 0) * volumeForecast.forecast_90d_total) : parsed2.recommended_model === "Hybrid" ? Math.round(projected_profitability_90d + (hybridModel?.margin_delta_vs_current ?? 0) * volumeForecast.forecast_90d_total) : projected_profitability_90d;
  return {
    data: {
      hub_id: hubId,
      recommended_model: parsed2.recommended_model,
      margin_uplift: parsed2.margin_uplift,
      risk_score: parsed2.risk_score,
      confidence: parsed2.confidence,
      projected_profitability_90d: recommended_90d
    },
    reasoning: parsed2.reasoning,
    confidence: parsed2.confidence
  };
}

// src/agents/hub-summary.agent.ts
var SYSTEM_PROMPT5 = `You are a logistics network optimization expert for RedX, a courier company in Bangladesh.
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
- "keep"           \u2014 hub is profitable, no action needed
- "shift_to_4pl"   \u2014 hub losing money, routing to 4PL partner would reduce cost
- "shift_to_3pl"   \u2014 hub losing money due to high 4PL costs, bring back in-house
- "mixed_optimize" \u2014 some areas should go 4PL, others back to 3PL
- "assign_partners"\u2014 hub has unassigned areas that need a partner

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
async function fetchHubMargins() {
  return query(
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
async function fetchAreaAssignments() {
  return query(
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
async function fetchAvailablePartners2() {
  return query(
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
function buildAreaBreakdowns(areaRows) {
  const areaMap = /* @__PURE__ */ new Map();
  for (const row of areaRows) {
    if (!areaMap.has(row.area_id)) {
      areaMap.set(row.area_id, {
        hubId: row.hub_id,
        partnerIds: /* @__PURE__ */ new Set(),
        area: {
          area_id: row.area_id,
          area_name: row.area_name,
          zone_id: row.zone_id,
          partner_id: null,
          partner_name: null,
          is_4pl: false,
          is_unassigned: true
        }
      });
    }
    const entry = areaMap.get(row.area_id);
    if (row.partner_id !== null) {
      entry.partnerIds.add(row.partner_id);
      entry.area.is_unassigned = false;
      if (entry.area.partner_id === null) {
        entry.area.partner_id = row.partner_id;
        entry.area.partner_name = row.partner_name;
      }
      if (row.partner_id !== 3) entry.area.is_4pl = true;
    }
  }
  const hubMap = /* @__PURE__ */ new Map();
  for (const { hubId, area } of areaMap.values()) {
    if (!hubMap.has(hubId)) {
      hubMap.set(hubId, { total: 0, fourpl: 0, thrpl: 0, unassigned: 0, areas: [] });
    }
    const bd = hubMap.get(hubId);
    bd.total++;
    bd.areas.push(area);
    if (area.is_4pl) bd.fourpl++;
    else if (area.is_unassigned) bd.unassigned++;
    else bd.thrpl++;
  }
  return hubMap;
}
function toPartnerZoneId(zoneId) {
  if (zoneId === 1) return 1;
  if (zoneId === 2) return 2;
  return 3;
}
function cheapestPartnerForZone(partnerZoneId, partners) {
  const candidates = partners.filter((p) => p.zone_id === partnerZoneId && p.kg1_price !== null);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, p) => p.kg1_price < best.kg1_price ? p : best);
}
var MAX_SUGGESTIONS = 20;
var MAX_PER_DIRECTION = 10;
function buildSuggestedAssignments(recommendation, breakdown, partners) {
  const suggestions = [];
  const shouldSuggest4pl = recommendation !== "shift_to_3pl" && recommendation !== "keep";
  if (shouldSuggest4pl) {
    const limit = breakdown.areas.some((a) => a.is_4pl) ? MAX_PER_DIRECTION : MAX_SUGGESTIONS;
    const candidates = breakdown.areas.filter((a) => a.is_unassigned || !a.is_4pl && !a.is_unassigned).slice(0, limit);
    for (const area of candidates) {
      const partnerZoneId = toPartnerZoneId(area.zone_id);
      const partner = cheapestPartnerForZone(partnerZoneId, partners);
      if (!partner) continue;
      suggestions.push({
        area_id: area.area_id,
        area_name: area.area_name,
        current_partner_id: area.partner_id,
        current_partner_name: area.is_unassigned ? "Unassigned (3PL default)" : area.partner_name ?? "Shopup Internal",
        recommended_partner_id: partner.partner_id,
        recommended_partner_name: partner.partner_name,
        reason: `Assign to cheapest 4PL for zone (BDT ${partner.kg1_price}/kg)`
      });
    }
  }
  const shouldSuggest3pl = recommendation !== "shift_to_4pl" || breakdown.areas.some((a) => a.is_4pl);
  if (shouldSuggest3pl && recommendation !== "keep") {
    const limit = shouldSuggest4pl ? MAX_PER_DIRECTION : MAX_SUGGESTIONS;
    const candidates = breakdown.areas.filter((a) => a.is_4pl).slice(0, limit);
    for (const area of candidates) {
      suggestions.push({
        area_id: area.area_id,
        area_name: area.area_name,
        current_partner_id: area.partner_id,
        current_partner_name: area.partner_name ?? `Partner ${area.partner_id}`,
        recommended_partner_id: 3,
        recommended_partner_name: "Shopup Internal",
        reason: "Revert to 3PL (Shopup Internal) \u2014 evaluate if internal routing reduces cost"
      });
    }
  }
  if (recommendation === "mixed_optimize") {
    return suggestions;
  }
  return suggestions;
}
function parseClaudeJson6(raw) {
  const cleaned = raw.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();
  const start = cleaned.search(/[{[]/);
  if (start === -1) throw new Error(`No JSON found in Claude response: ${cleaned.slice(0, 100)}`);
  const openChar = cleaned[start];
  const closeChar = openChar === "{" ? "}" : "]";
  const end = cleaned.lastIndexOf(closeChar);
  if (end === -1) throw new Error(`No closing ${closeChar} found in Claude response`);
  return JSON.parse(cleaned.slice(start, end + 1));
}
async function runHubSummaryAgent() {
  logger.debug("[HubSummaryAgent] Fetching hub data");
  const [margins, areaRows, partners] = await Promise.all([
    fetchHubMargins(),
    fetchAreaAssignments(),
    fetchAvailablePartners2()
  ]);
  logger.debug("[HubSummaryAgent] DB fetch complete", {
    hubs: margins.length,
    areaRows: areaRows.length,
    partners: partners.length
  });
  if (margins.length === 0) {
    return {
      data: { generated_at: (/* @__PURE__ */ new Date()).toISOString(), total_hubs: 0, losing_hubs: 0, hubs: [] },
      reasoning: "No hub contribution data found.",
      confidence: 0
    };
  }
  const areaBreakdowns = buildAreaBreakdowns(areaRows);
  const MAX_CLAUDE_HUBS = 15;
  const allProblemHubs = margins.filter((m) => {
    const bd = areaBreakdowns.get(m.hub_id);
    return m.total_margin_3m < 0 || bd && bd.unassigned > 0;
  });
  const problemHubs = allProblemHubs.slice(0, MAX_CLAUDE_HUBS);
  const keepHubs = margins.filter((m) => !problemHubs.some((p) => p.hub_id === m.hub_id));
  logger.debug("[HubSummaryAgent] Hub split", {
    problemHubs: problemHubs.length,
    autoKeep: keepHubs.length
  });
  const hubsForClaude = problemHubs.map((m) => {
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
      area_breakdown: bd ? { total: bd.total, fourpl: bd.fourpl, thrpl: bd.thrpl, unassigned: bd.unassigned } : { total: 0, fourpl: 0, thrpl: 0, unassigned: 0 }
    };
  });
  const userPrompt = `Hub performance summaries (last 3 months) \u2014 ${hubsForClaude.length} hubs:
${JSON.stringify(hubsForClaude, null, 2)}

Available 4PL partners and zone pricing:
${JSON.stringify(partners, null, 2)}

Analyze each hub and return your recommendations.`;
  const autoKeepItems = keepHubs.map((m) => {
    const bd = areaBreakdowns.get(m.hub_id);
    const hasUnassigned = bd && bd.unassigned > 0;
    return {
      hub_id: m.hub_id,
      hub_name: m.hub_name,
      recommendation: hasUnassigned ? "assign_partners" : "keep",
      priority: hasUnassigned ? "medium" : "low",
      recommended_action: hasUnassigned ? `Hub has ${bd.unassigned} unassigned areas. Consider assigning a 4PL partner.` : "Hub is profitable. No action needed.",
      estimated_margin_improvement_90d: 0,
      suggested_assignments: hasUnassigned && bd ? buildSuggestedAssignments("assign_partners", bd, partners) : [],
      total_areas: bd?.total ?? 0,
      fourpl_areas: bd?.fourpl ?? 0,
      thrpl_areas: bd?.thrpl ?? 0,
      unassigned_areas: bd?.unassigned ?? 0,
      avg_monthly_margin: Math.round(m.total_margin_3m / 3),
      projected_margin_90d: m.total_margin_3m,
      avg_margin_per_parcel: m.avg_margin_per_parcel,
      total_parcels_3m: m.total_parcels_3m,
      is_losing_money: false
    };
  });
  if (hubsForClaude.length === 0) {
    return {
      data: {
        generated_at: (/* @__PURE__ */ new Date()).toISOString(),
        total_hubs: autoKeepItems.length,
        losing_hubs: 0,
        hubs: autoKeepItems
      },
      reasoning: "All hubs are profitable with no unassigned areas.",
      confidence: 90
    };
  }
  logger.debug("[HubSummaryAgent] Calling Claude", {
    hubCount: hubsForClaude.length,
    promptTokensEstimate: Math.round(userPrompt.length / 4)
  });
  const maxOutputTokens = Math.min(hubsForClaude.length * 350 + 500, 8192);
  let raw;
  try {
    raw = await runPromptWithOptions(SYSTEM_PROMPT5, userPrompt, maxOutputTokens);
    logger.debug("[HubSummaryAgent] Claude response received");
  } catch (err) {
    logger.error("[HubSummaryAgent] Claude call failed", { message: err.message });
    throw err;
  }
  let recs;
  try {
    recs = parseClaudeJson6(raw);
  } catch (err) {
    logger.error("[HubSummaryAgent] JSON parse failed", { raw: raw.slice(0, 300), message: err.message });
    throw err;
  }
  const claudeHubs = recs.map((rec) => {
    const margin = margins.find((m) => m.hub_id === rec.hub_id);
    const bd = areaBreakdowns.get(rec.hub_id);
    const suggested_assignments = bd ? buildSuggestedAssignments(rec.recommendation, bd, partners) : [];
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
      is_losing_money: (margin?.total_margin_3m ?? 0) < 0
    };
  });
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const hubs = [...claudeHubs, ...autoKeepItems].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  const losing_hubs = hubs.filter((h) => h.is_losing_money).length;
  return {
    data: {
      generated_at: (/* @__PURE__ */ new Date()).toISOString(),
      total_hubs: hubs.length,
      losing_hubs,
      hubs
    },
    reasoning: `Analyzed ${hubs.length} hubs. ${losing_hubs} are losing money.`,
    confidence: 75
  };
}

// src/modules/hubs/hubs.service.ts
async function getAllHubs() {
  return query(
    `SELECT ID AS id, HUB_NAME AS name, OPERATIONAL_CODE AS operational_code
     FROM sl_hubs
     WHERE STATUS = 'active' AND IS_DELIVERY = 1
     ORDER BY HUB_NAME ASC`
  );
}
async function getHubProfitability(hubId) {
  logger.info("Starting hub profitability analysis", { hubId });
  const volumeResult = await runVolumeForecastAgent(hubId);
  const costResult = await runCostModelingAgent(hubId, volumeResult.data);
  const strategyResult = await runNetworkStrategyAgent(hubId, volumeResult.data, costResult.data);
  logger.info("Hub profitability analysis complete", { hubId, recommendation: strategyResult.data.recommendation });
  return strategyResult.data;
}
async function getHubModelAdvice(hubId) {
  logger.info("Starting hub model advice", { hubId });
  const volumeResult = await runVolumeForecastAgent(hubId);
  const costResult = await runCostModelingAgent(hubId, volumeResult.data);
  const advisorResult = await runHubModelAdvisorAgent(hubId, volumeResult.data, costResult.data);
  logger.info("Hub model advice complete", { hubId, model: advisorResult.data.recommended_model });
  return advisorResult.data;
}
async function upsertHubCost(input) {
  await query(
    `INSERT INTO dm_hub_monthly_costs
       (hub_id, year, month, rent, employee_cost, utility_cost, maintenance_cost, other_cost, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       rent              = VALUES(rent),
       employee_cost     = VALUES(employee_cost),
       utility_cost      = VALUES(utility_cost),
       maintenance_cost  = VALUES(maintenance_cost),
       other_cost        = VALUES(other_cost),
       notes             = VALUES(notes)`,
    [
      input.hub_id,
      input.year,
      input.month,
      input.rent,
      input.employee_cost,
      input.utility_cost,
      input.maintenance_cost,
      input.other_cost,
      input.notes ?? null
    ]
  );
  const rows = await query(
    `SELECT * FROM dm_hub_monthly_costs
     WHERE hub_id = ? AND year = ? AND month = ?`,
    [input.hub_id, input.year, input.month]
  );
  return rows[0];
}
async function getHubSummary() {
  logger.info("Starting hub summary analysis");
  const result = await runHubSummaryAgent();
  logger.info("Hub summary complete", {
    total_hubs: result.data.total_hubs,
    losing_hubs: result.data.losing_hubs
  });
  return result.data;
}
async function assignAreaPartners(assignments) {
  logger.info("Assigning area partners", { count: assignments.length });
  const results = [];
  for (const { area_id, partner_id } of assignments) {
    try {
      await query(
        `UPDATE sl_area_partners SET STATUS = 'inactive' WHERE AREA_ID = ?`,
        [area_id]
      );
      await query(
        `INSERT INTO sl_area_partners (AREA_ID, PARTNER_ID, STATUS)
         VALUES (?, ?, 'active')
         ON DUPLICATE KEY UPDATE STATUS = 'active'`,
        [area_id, partner_id]
      );
      const partnerRows = await query(
        `SELECT NAME FROM sl_delivery_partners WHERE ID = ? LIMIT 1`,
        [partner_id]
      );
      const partner_name = partnerRows[0]?.NAME ?? (partner_id === 3 ? "Shopup Internal" : `Partner ${partner_id}`);
      results.push({ area_id, partner_id, partner_name, status: "assigned" });
      logger.debug("Area partner assigned", { area_id, partner_id, partner_name });
    } catch (err) {
      logger.error("Failed to assign partner for area", {
        area_id,
        partner_id,
        message: err.message
      });
      results.push({ area_id, partner_id, partner_name: "", status: "failed", error: err.message });
    }
  }
  const succeeded = results.filter((r) => r.status === "assigned").length;
  logger.info("Area partner assignment complete", { total: assignments.length, succeeded });
  return results;
}
async function getHubCosts(hubId, year, month) {
  if (year && month) {
    return query(
      `SELECT * FROM dm_hub_monthly_costs WHERE hub_id = ? AND year = ? AND month = ?`,
      [hubId, year, month]
    );
  }
  return query(
    `SELECT * FROM dm_hub_monthly_costs WHERE hub_id = ? ORDER BY year DESC, month DESC`,
    [hubId]
  );
}

// src/modules/hubs/hubs.controller.ts
async function hubSummaryHandler(_req, res, next) {
  try {
    const result = await getHubSummary();
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
async function assignPartnersHandler(req, res, next) {
  try {
    const body = assignPartnersBodySchema.safeParse(req.body);
    if (!body.success) throw new ValidationError("Invalid request body", body.error.flatten());
    const results = await assignAreaPartners(body.data.assignments);
    sendSuccess(res, results);
  } catch (err) {
    next(err);
  }
}
async function listHubs(_req, res, next) {
  try {
    const hubs = await getAllHubs();
    sendSuccess(res, hubs);
  } catch (err) {
    next(err);
  }
}
async function hubProfitability(req, res, next) {
  try {
    const parsed2 = hubParamsSchema.safeParse(req.params);
    if (!parsed2.success) throw new ValidationError("Invalid hub ID", parsed2.error.flatten());
    const result = await getHubProfitability(parsed2.data.hubId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
async function hubModelAdvice(req, res, next) {
  try {
    const parsed2 = hubParamsSchema.safeParse(req.params);
    if (!parsed2.success) throw new ValidationError("Invalid hub ID", parsed2.error.flatten());
    const result = await getHubModelAdvice(parsed2.data.hubId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
async function getHubCostsHandler(req, res, next) {
  try {
    const params = hubParamsSchema.safeParse(req.params);
    if (!params.success) throw new ValidationError("Invalid hub ID", params.error.flatten());
    const queryParams = hubCostQuerySchema.safeParse(req.query);
    if (!queryParams.success) throw new ValidationError("Invalid query params", queryParams.error.flatten());
    const costs = await getHubCosts(
      params.data.hubId,
      queryParams.data.year,
      queryParams.data.month
    );
    sendSuccess(res, costs);
  } catch (err) {
    next(err);
  }
}
async function upsertHubCostHandler(req, res, next) {
  try {
    const params = hubParamsSchema.safeParse(req.params);
    if (!params.success) throw new ValidationError("Invalid hub ID", params.error.flatten());
    const body = hubCostBodySchema.safeParse(req.body);
    if (!body.success) throw new ValidationError("Invalid request body", body.error.flatten());
    const cost = await upsertHubCost({ hub_id: params.data.hubId, ...body.data });
    sendCreated(res, cost);
  } catch (err) {
    next(err);
  }
}

// src/modules/hubs/hubs.routes.ts
var router3 = (0, import_express3.Router)();
router3.get("/summary", hubSummaryHandler);
router3.post("/assign-partners", assignPartnersHandler);
router3.get("/", listHubs);
router3.get("/:hubId/profitability", hubProfitability);
router3.get("/:hubId/model-advice", hubModelAdvice);
router3.get("/:hubId/costs", getHubCostsHandler);
router3.post("/:hubId/costs", upsertHubCostHandler);

// src/modules/areas/areas.routes.ts
var import_express4 = require("express");

// src/modules/areas/areas.controller.ts
async function listAreas(_req, res, next) {
  try {
    const rows = await query(
      `SELECT DISTINCT a.ID AS id, a.NAME AS name, a.NAME_BN AS name_bn
       FROM sl_areas a
       INNER JOIN sl_area_hub ah ON ah.AREA_ID = a.ID AND ah.STATUS = 'active'
       WHERE a.STATUS = 'active'
       ORDER BY a.NAME ASC`
    );
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
}

// src/modules/areas/areas.routes.ts
var router4 = (0, import_express4.Router)();
router4.get("/", listAreas);

// src/app.ts
function createApp() {
  const app = (0, import_express5.default)();
  app.use((0, import_helmet.default)());
  app.use((0, import_cors.default)(appConfig.cors));
  app.use(import_express5.default.json());
  app.use(import_express5.default.urlencoded({ extended: true }));
  app.use(requestLoggerMiddleware);
  app.get("/", (_req, res) => {
    res.status(200).json({ api: "DispatchMindAI", version: "1.0.0", status: "ok" });
  });
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.use(`${appConfig.apiPrefix}/areas`, router4);
  app.use(`${appConfig.apiPrefix}/dispatch`, router);
  app.use(`${appConfig.apiPrefix}/partners`, router2);
  app.use(`${appConfig.apiPrefix}/hubs`, router3);
  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);
  return app;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createApp
});
