# llm-text-api

Small Express + TypeScript service that takes a piece of text, sends it to Claude (Anthropic) or OpenAI, and returns the model's reply as JSON.

It has API key auth, request validation, rate limiting and a consistent error format. There's also a `mock` provider so you can run it and run the tests without any LLM key.

## Quick start

Needs Node 22.12+ (I use 24).

```bash
npm install
cp .env.example .env    # set SERVICE_API_KEY
npm run dev             # http://localhost:3000
```

`.env.example` uses the mock provider by default. To call a real model, set `LLM_PROVIDER=anthropic` or `LLM_PROVIDER=openai` and add the matching key.

Other scripts:

```bash
npm test         # vitest
npm run build    # compile to dist/
npm start        # node dist/index.js
```

The tests run against the mock provider and a stubbed `fetch`, so they don't hit any external API.

## API

### GET /health

No auth. Returns `{ "status": "ok" }`.

### POST /api/generate

Send the key in an `x-api-key` header.

| Field       | Type    | Notes                              |
| ----------- | ------- | ---------------------------------- |
| `text`      | string  | required, trimmed, 1-4000 chars    |
| `system`    | string  | optional system prompt, max 1000   |
| `maxTokens` | integer | optional, 1-1024, default 512      |

Unknown fields are rejected and the body is capped at 10kb.

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -H "x-api-key: $SERVICE_API_KEY" \
  -d '{"text": "Explain what an API rate limit is.", "system": "Answer in one short paragraph.", "maxTokens": 200}'
```

```json
{
  "output": "An API rate limit caps how many requests a client can make in a given time window...",
  "provider": "anthropic",
  "model": "claude-opus-5-5",
  "usage": { "inputTokens": 31, "outputTokens": 58 },
  "requestId": "31a5079d-e801-494b-9f72-d043b84b75cd"
}
```

The request ID is also returned in the `X-Request-Id` header and shows up in the server logs.

### Errors

Every error looks like this:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "text: must not be empty",
    "requestId": "739b7df0-5592-4da9-9cc8-995de808069c"
  }
}
```

| Status | Code                | Meaning                                                      |
| ------ | ------------------- | ------------------------------------------------------------ |
| 400    | `VALIDATION_ERROR`  | invalid body, message says which field                       |
| 400    | `INVALID_JSON`      | body isn't valid JSON                                        |
| 400    | `BAD_REQUEST`       | other malformed request (e.g. unsupported charset)           |
| 401    | `UNAUTHORIZED`      | missing or wrong `x-api-key`                                 |
| 404    | `NOT_FOUND`         | unknown route                                                |
| 413    | `PAYLOAD_TOO_LARGE` | body over 10kb                                               |
| 429    | `RATE_LIMITED`      | over 20 requests/min per IP, or the provider rate limited us |
| 500    | `INTERNAL_ERROR`    | unexpected server error                                      |
| 502    | `UPSTREAM_ERROR`    | provider failed, refused, or returned no text                |
| 504    | `UPSTREAM_TIMEOUT`  | provider didn't answer within 30s                            |

Provider error details and stack traces are only logged, never returned to the client.

## Configuration

| Variable            | Required                  | Description                                                       |
| ------------------- | ------------------------- | ----------------------------------------------------------------- |
| `SERVICE_API_KEY`   | yes                       | key clients send in `x-api-key`                                   |
| `LLM_PROVIDER`      | yes                       | `anthropic`, `openai` or `mock`                                   |
| `ANTHROPIC_API_KEY` | if provider is anthropic  |                                                                   |
| `OPENAI_API_KEY`    | if provider is openai     |                                                                   |
| `LLM_MODEL`         | no                        | defaults to `claude-opus-5-5` / `gpt-6-astra`                     |
| `PORT`              | no                        | default 3000 (Render sets it)                                     |

If a required variable is missing the server exits on startup and tells you which one.

To generate a service key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keys only come from the environment. They aren't logged, and the request log only has method, path, status, duration and request ID (no request text).

## Sample requests

`scripts/test-requests.sh` runs three requests: a normal one, one with `system` and `maxTokens`, and one with empty text to show the 400 response.

```bash
BASE_URL=http://localhost:3000 SERVICE_API_KEY=your-key ./scripts/test-requests.sh
```

Use Git Bash or WSL on Windows.

## Deploying to Render

The repo includes a `render.yaml` blueprint (free web service, health check on `/health`).

1. Push the repo to GitHub.
2. In Render, go to **New > Blueprint** and select the repo.
3. Fill in `SERVICE_API_KEY`, `LLM_PROVIDER` and the key for the provider you're using. The other provider key isn't read, so any placeholder is fine if the form won't take it empty.
4. Apply. Render runs `npm ci && npm run build`, then `npm start`.
5. Check `https://<your-service>.onrender.com/health`.

Render only asks for these values when the blueprint is first created. Change them later (or add `LLM_MODEL`) under the service's Environment tab.

If you're using a real provider, set a spend limit in the Anthropic/OpenAI console first.

## Project layout

```
src/
  index.ts            entry point
  app.ts              express app setup
  config.ts           env parsing and validation
  middleware/         auth, request logging, errors
  routes/generate.ts  POST /api/generate
  providers/          anthropic, openai, mock
tests/
scripts/test-requests.sh
```

Each provider implements the `LLMProvider` interface in `src/providers/types.ts`. Adding another one means a new file there plus an entry in `providers/index.ts` and `config.ts`.

## Limitations

- The rate limiter is in memory, so it resets on restart and isn't shared between instances. Running more than one instance would need something like Redis.
- There's one shared API key. No per-user keys or quotas.
- Render's free tier sleeps when idle, so the first request after a while can take 30+ seconds.
- `maxTokens` also covers the model's reasoning tokens. Both providers are called with low reasoning effort, but a very small limit can still run out before any text is written; that comes back as a 502 asking for a higher `maxTokens`. If the limit is hit mid-answer, the partial reply is returned.
- Only the default models have been tested. Another `LLM_MODEL` needs to support the low reasoning-effort setting.
- No streaming.
- `trust proxy` is set to 1, which matches Render. Other setups may need a different value for rate limiting to see the right client IP.
