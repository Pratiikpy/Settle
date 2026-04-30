# @settle/demo-agent

Generic AI agent (`Agent-1`) that signs x402 requests with a Settle credential and fetches deliverables from demo merchants. Used in the 90-second demo flow.

**Not branded as Claude.** Compatible with Claude Desktop via MCP, but Anthropic is not affiliated with this project.

## Run

Pre-reqs (one-time setup via the web app):
1. `/onboarding` → connect Phantom → airdrop → create card → save the agent secret
2. `POST /api/agents/credential` → get the `settle://...` URI

Then in `apps/demo-agent/.env`:
```
SETTLE_FACILITATOR_URL=http://localhost:3000
SETTLE_CREDENTIAL=settle://...
SETTLE_AGENT_PRIVKEY=...base58 64-byte secret...
SETTLE_PACT_PUBKEY=...optional pact pubkey for tighter policy enforcement...
```

Then:
```bash
pnpm dev:agent
```

## What it does

For each of 3 hardcoded tasks (ArxivFetch, TranslateAPI, SummaryLLM):

1. Builds canonical request line: `METHOD\nPATH\nsha256(body)\nts\nnonce`
2. Signs it with `SETTLE_AGENT_PRIVKEY` (Ed25519)
3. POSTs to `${SETTLE_FACILITATOR_URL}/api/x402/proxy/<merchant>` with all required `X-Settle-*` headers
4. Receives the deliverable JSON + receipt hashes
5. Logs each step

## Output example
```
═════════════════════════════════════════════════════════════
Settle Demo Agent · Agent-1
Facilitator: http://localhost:3000
Tasks: 3
═════════════════════════════════════════════════════════════

→ ArxivFetch ($0.10) ...
  ✓ 200 OK in 412ms
  receipt: a1b2c3d4e5f60718…

→ TranslateAPI ($0.30) ...
  ✓ 200 OK in 380ms
  receipt: 9f8e7d6c5b4a3210…

→ SummaryLLM ($0.05) ...
  ✓ 200 OK in 401ms
  receipt: 5e4d3c2b1a098765…

═════════════════════════════════════════════════════════════
Done. 3/3 tasks completed.
Total spent: $0.45
```
