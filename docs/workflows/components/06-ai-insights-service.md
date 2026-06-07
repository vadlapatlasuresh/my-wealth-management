# Component · AI Insights Service (:8086) — LLM 🟡 mock

**Responsibility:** generate financial insights + power the AI chat assistant via an LLM provider —
currently a **mock** (templated). Persists generated insights.
**Source:** [finance-mvp/apps/ai-insights-service](../../../finance-mvp/apps/ai-insights-service) · 🗄️ schema `ai`

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/ai/insights` | list insights |
| POST | `/api/v1/ai/insights/refresh` | regenerate (delete + recreate per user) |
| POST | `/api/v1/ai/chat` | chat with assistant |

## Data model
```mermaid
erDiagram
    INSIGHTS {
        bigint id PK
        bigint user_id
        string title
        string reason "LLM-generated (mock)"
        string severity "INFO|WARNING|ACTIONABLE"
        string suggested_action
        timestamp created_at
    }
```
> Only processed insights are stored — **no raw LLM request/response** is persisted.

## Provider selection
```mermaid
flowchart LR
    SVC[ai-insights] --> IFACE[AiProvider]
    IFACE --> MOCK["MockAiProvider 🟡 templated"]
    IFACE -.future.-> REAL["Claude/OpenAI impl 🟢<br/>AI_PROVIDER, AI_MODEL, *_API_KEY"]
```

## Chat sequence
```mermaid
sequenceDiagram
    actor U as User
    participant AI as ai-insights
    U->>AI: POST /ai/chat {message, history, scope}
    AI->>AI: MockAiProvider → templated reply
    AI-->>U: reply
    Note over AI: refresh = deleteByUserId + regenerate (hard delete)
```

## Status / pending
- 🟡 Insights + chat wired on mock.
- ⬜ Real LLM (`AI_PROVIDER=anthropic`, default model `claude-opus-4-8`); feed real account/budget context;
  consider storing chat history; prompt library is hardcoded client-side.
