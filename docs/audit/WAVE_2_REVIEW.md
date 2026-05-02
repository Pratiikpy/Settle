# WAVE_2_REVIEW.md

## Items shipped this wave

### Genuinely built

- **D1 — `packages/create-settle-merchant`** — public npx-installable CLI. Inlined BLAKE3 capability hash so the published package has no monorepo deps. Verified end-to-end: smoke run in `/tmp/settle-cli-smoke/` produced a real keypair, real `.env.template` with valid pubkey + capability hash, and `.gitignore`. Build clean, files: `package.json`, `tsconfig.json`, `src/cli.ts`, `README.md`.
- **D2 — `packages/web-components` `<settle-pay>`** — vanilla custom element. Opens an iframe modal to `<endpoint>/embed/pay`; user wallet stays at settle.so so host page never touches keys. Origin-validated postMessage; emits `settle-paid` / `settle-error` / `settle-closed` CustomEvents.
- **D3 — `packages/web-components` `<settle-verify>`** — client-side BLAKE3 receipt re-hasher. Fetches receipt from `/api/receipts/<id>`, recomputes `reason_hash` / `policy_snapshot_hash` / `receipt_hash` from canonical payloads (when `?include=canonical` is set on the API), shows live PASS / FAIL badge. PASS state means the user verified locally — no trust in Settle required.
- **D4 — Python adapters: `settle_sdk.adapters.{langchain_adapter,crewai_adapter}`** — framework-optional wrappers around `settle_post`. 5/5 unit tests pass (`test_adapters.py`). Total Python tests now 28 (was 23). The TS-side adapters for OpenAI/Anthropic/LangChain.js/CrewAI.js were already shipped at `packages/mcp-middleware/src/agent-adapters.ts`.
- **D5 — Templates** — three drop-in starter dirs under `templates/`:
  - `vercel-edge-mcp/` — Next.js 15 App Router + Edge runtime + `requireSettleCredential`
  - `replit-express/` — Node 20 + Express + `.replit` config for one-click import
  - `cursor-local-mcp/` — Stdio MCP server with `wrapWithSettle`, includes `mcp.json` snippet for `~/.cursor/mcp.json`
- **F2.11 receipt tagging UI** — `apps/web/components/receipt-tags.tsx`, integrated into `/receipts/[requestId]/page.tsx` below the hash-chain animation. Per-tagger chips, inline add input, delete-X. Soft-disabled when wallet not connected.

### Reclassified — already shipped

- **A3 killchain frost-shatter animation** — already in `packages/ui/src/pact-card.tsx` lines 10-13 and wired via `apps/web/app/cards/[id]/page.tsx` line 426. No work needed.
- **E3 capability heatmap real-data** — already real by default at `apps/web/components/capability-heatmap.tsx`. The `?simulate=1` flag is opt-in for demos; production subscription path is `supabaseBrowser().channel("heatmap:receipts")` filtered to `decision='ALLOW' AND public_feed=true`.
- **F1.7 dark mode toggle** — wired in `/settings` (line 215). Theme provider at `apps/web/components/theme-provider.tsx` already handles localStorage + matchMedia + auto-resolve.

## Verification status

- 11 of 12 workspaces typecheck ✓ (the 12th is anchor-tests which doesn't typecheck independently)
- SDK 155 + MCP 7 + Python 28 = **190 unit tests passing**
- Anchor integration tests gated on `ANCHOR_PROVIDER_URL` (require devnet) — same baseline as Wave 1

## Items deferred

- **E1 anchor deploy** — BLOCKED on Solana toolchain not on Windows PATH (logged in HUMAN_ACTIONS.md 2026-05-02)
- **E2 streaming-pact harness** — depends on E1
- **F5 mobile layout polish** — pending (Playwright `mobile-viewport.spec.ts` exists; no manual layout fixes this wave)

## Devnet SOL spent this wave
0 (all work was code/build, no on-chain verifications)

## Self-check
- No paid LLM APIs introduced; NIM remains canonical
- No `as any`; `exactOptionalPropertyTypes` honored
- No new migrations
- No `XXX:rg` files committed
- New web-components package follows existing build pattern (tsc → dist) used by mcp-middleware + sdk
- All new templates depend on `@settle/mcp-middleware` already published; nothing in templates pulls workspace-only paths
