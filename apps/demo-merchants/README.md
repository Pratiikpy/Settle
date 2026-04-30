# @settle/demo-merchants

Three demo x402 merchants used in the 90-second demo. Hono server with `/arxiv-fetch`, `/translate`, `/summarize` endpoints.

## Run
```bash
pnpm dev:merchants
```

Listens on `http://localhost:8788` by default (override via `PORT`).

## Endpoints

Each follows the x402 challenge pattern:

| Path | Price | Behavior |
|---|---|---|
| `POST /arxiv-fetch` | $0.10 | First call without `X-Settle-Credential` → 402 with `X-402-Required: settle`. Subsequent call with credential → 200 + paper deliverable. |
| `POST /translate` | $0.30 | Same; returns translation deliverable |
| `POST /summarize` | $0.05 | Same; returns ELI12 summary |
| `GET /` | — | Lists endpoints |

## Wiring

The `apps/web` x402 proxy at `/api/x402/proxy/[merchant]` validates the agent's dual-sig, runs on-chain policy, builds + submits the spend ix, then forwards the original request to one of these endpoints based on the `[merchant]` slug.

`DEMO_MERCHANTS_URL` env var in `apps/web/.env.local` points to this server.

## V1 simplification

These merchants don't run the full x402 facilitator themselves — the apps/web proxy handles all the policy verification + spend ix submission. They just check for the credential header presence as a first-line gate.

In V2, third-party merchants would integrate the x402 spec independently, calling Settle's facilitator (or any other compatible facilitator) to verify payments.
