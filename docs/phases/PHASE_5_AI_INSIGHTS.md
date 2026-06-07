# Phase 5 — AI Insights Service ✅ DONE (mock provider)

> **Status:** Built and live. `ai-insights-service` (:8086) at `/api/v1/ai` (insights, insights/refresh,
> chat); `AIAssistantPage` is wired with a working chat + insights list. Logic uses `MockAiProvider`
> (curated insights + templated chat, no network). Set `AI_PROVIDER`/`ANTHROPIC_API_KEY` (or OpenAI)
> and implement the real `AiProvider` over the user's financial summary to go live. Checklist kept for cutover.


**Goal:** Replace mock `/v1/ai/insights` and power `AIAssistantPage` with real LLM-driven
financial insights and a chat assistant grounded in the user's data.

> Use the latest Claude models (e.g. `claude-opus-4-8` / `claude-sonnet-4-6`) or OpenAI; keep the
> provider behind an interface. Never send secrets/PII beyond what's needed; redact account numbers.

## Backend
- [ ] Scaffold `apps/ai-insights-service` (Spring Boot, Java 17), port **8086**.
- [ ] Insight generator: pull the user's snapshot + budgets + recent transactions (via Feign to
      financial-core / aggregation), build a prompt, call the LLM, parse to structured insights
      (id, title, reason, severity, suggestedAction). Cache daily per user.
- [ ] Chat endpoint: `POST /api/v1/ai/chat` with conversation history + retrieved user context
      (RAG over their financial summary). Stream if feasible (SSE).
- [ ] Endpoints (`/api/v1/ai`): `GET /insights`, `POST /insights/refresh`, `POST /chat`.
- [ ] Gateway route `/api/v1/ai/**` → 8086; retire legacy `/v1/ai/*` mock.
- [ ] Rate limiting + token-budget guardrails.

## Frontend
- [ ] `AIAssistantPage.jsx` (theme-compliant) → live insights list + working chat box.
- [ ] HomePage "AI Insights" widget → live `getInsights()`.
- [ ] `api.js`: `getInsights`, `refreshInsights`, `chatWithAssistant`.

## Env / keys
- [ ] `ai.provider`, `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, model id, max-tokens.

## Acceptance criteria
- [ ] Insights reflect the user's real linked data and update on refresh.
- [ ] Chat answers grounded questions ("can I afford X?") using their numbers.
- [ ] No raw credentials/PII leave the backend; errors degrade gracefully.
