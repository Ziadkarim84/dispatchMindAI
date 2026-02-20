# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DispatchMindAI** is an AI-driven autonomous decision engine for RedX logistics, optimizing parcel dispatch across 3PL (internal fleet) and 4PL (external partners) networks. It uses the Claude API (Anthropic SDK) as the AI backbone for routing, partner selection, and hub profitability prediction.

## Commands

```bash
npm run dev          # Start development server with nodemon auto-reload
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled output (node dist/main.js)
npm run lint         # Lint src/**/*.ts with ESLint
npm test             # Run Jest tests (--passWithNoTests)
npm run test:watch   # Jest in watch mode
npm run test:coverage # Jest with coverage report
```

## Environment Setup

Copy `.env.example` to `.env` and fill in:
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — MySQL connection (default DB: `redx_business_predictor`, timezone `+06:00`)
- `ANTHROPIC_API_KEY` — required for AI agent features
- `JWT_SECRET` — minimum 32 characters
- `LOG_LEVEL` — debug/info/warn/error

Environment variables are validated at startup via Zod (`src/config/env.validation.ts`). The app will not start if required variables are missing or invalid.

## Architecture

### Request Lifecycle
`main.ts` → validates env → connects DB → starts Express (`app.ts`) → middleware chain → routes → response

### Layer Structure

- **`src/config/`** — Centralized config. `env.validation.ts` (Zod schema), `app.config.ts` (port, CORS, API prefix `/api/v1`), `database.config.ts`
- **`src/database/`** — MySQL connection pool (`mysql2/promise`). Use `query<T>()` from `connection.ts` for all DB access.
- **`src/common/`** — Shared middleware, custom error classes, and utilities
  - Errors: `BaseError` → `ValidationError` (400), `NotFoundError` (404), `InternalServerError` (500)
  - Utils: Winston logger (`logger.util.ts`), standardized response formatter (`response.util.ts`)
- **`src/constants/`** — Dispatch types (3PL/4PL), risk levels (LOW/MEDIUM/HIGH), volume thresholds
- **`src/modules/`** *(planned)* — Feature modules (dispatch, partners, hubs)
- **`src/agents/`** *(planned)* — AI agents using Anthropic SDK

### TypeScript Path Aliases
```
@common/*   → src/common/*
@config/*   → src/config/*
@database/* → src/database/*
@modules/*  → src/modules/*  (not yet created)
@agents/*   → src/agents/*   (not yet created)
```

### API Response Format

All responses use the standardized formatter from `response.util.ts`:
```json
// Success
{ "success": true, "data": {}, "meta": { "timestamp": "...", "requestId": "uuid" } }

// Error
{ "success": false, "error": { "code": "...", "message": "..." }, "meta": { "timestamp": "...", "requestId": "uuid" } }
```

### Planned AI Agents (not yet implemented)
Six agents are planned per `prd.md`: Volume Forecast, Cost Modeling, SLA Risk, Partner Evaluation, Network Strategy, and Executive Summary — all backed by the Anthropic Claude API.

## Current State

The project is a well-structured scaffold. The infrastructure (Express, MySQL pool, middleware, error handling) is in place, but **no API routes or AI agents are implemented yet**. The `src/modules/` and `src/agents/` directories do not exist yet and need to be created for the planned features.
