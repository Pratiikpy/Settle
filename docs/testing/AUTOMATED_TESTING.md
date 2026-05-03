# Settle — Automated testing capabilities

> This is the tool-and-strategy map. Read it before starting a test run so I
> don't forget what I can do. For each area: which tools, which fixtures,
> exactly which command spawns the test, where state lives, where the
> assertion lives, how to verify on-chain + DB at the same time.

Companion to **`TEST_PLAN.md`** — that's *what* to test; this is *how*.

---

## A. Capabilities matrix (what I can drive)

| Capability | Tool | Where | Notes |
|---|---|---|---|
| Run shell | Bash + PowerShell | Windows host | full FS access |
| Linux toolchain | WSL2 Ubuntu 22.04 | `wsl -d Ubuntu-22.04 …` | Anchor, solana CLI, GLIBC stuff lives here |
| Node + pnpm + npm + npx | host | runs Next.js, indexer, demo-agent, demo-merchants |  |
| Python 3.11 | host | for Python SDK + pytest |  |
| Cargo / rustc | WSL | for Rust SDK + Anchor build |  |
| Browser drive | Playwright (chromium/firefox/webkit) | `apps/web/e2e/*.spec.ts` | already wired with `NEXT_PUBLIC_E2E_BURNER=1` |
| HTTP fetch | curl, fetch in scripts | any endpoint, public or auth | |
| Tx submit | `@solana/web3.js` + Helius devnet RPC | tx building + sending without GUI wallet | |
| Tx sign without Phantom | `Keypair.fromSecretKey(...)` | `apps/web/.test-wallet.json` exists; I can mint more | |
| Solana CLI | `solana` (in WSL) | `solana balance`, `solana airdrop`, `solana account` | |
| Anchor CLI | `anchor` (in WSL) | program IDL fetch / re-deploy | |
| RPC reads | `connection.getAccountInfo`, `getSignaturesForAddress`, `getParsedTransaction` | direct on-chain assertions | |
| Supabase reads/writes | service role key in env | SQL queries via `@supabase/supabase-js` | |
| QR decode | `jsqr` or `qrcode-reader` npm | parse a screenshot of a Solana Pay QR | |
| QR encode | `qrcode` npm | generate a QR for the merchant request flow | |
| Webhook receiver | local Express on `:4000` | logs every POST + validates HMAC | |
| Solana Pay | `@solana/pay` SDK | encode/decode `solana:` URLs | |
| MCP server | spawn `npx -y @settle/mcp` as child process | send JSON-RPC over stdio | |
| Multi-wallet | 3 burner Keypair JSONs | `Keypair.generate()` once, persist | |
| Background processes | `run_in_background: true` | dev server, indexer, webhook receiver all run in parallel | |
| Realtime sub | Supabase Realtime client + on('postgres_changes') | assert UI updates land within N ms of DB write | |
| Push notif test | mock `PushManager.subscribe` in Playwright | assert `push_subscriptions` row inserted | |
| Image diff | Playwright visual regression baselines | `--update-snapshots` to regen | |
| Time travel | `clock.setSystemTime` in Playwright | for time-windowed flows | |

**What I can't do programmatically (only these):**
1. Tap through a real installed Phantom Chrome extension popup. (Burner adapter via `NEXT_PUBLIC_E2E_BURNER=1` covers this — same wallet adapter contract, headless signing.)
2. Verify Twitter/X actually unfurls a Blink. (I can curl `/api/actions/...` and assert ActionGetResponse shape, which is what Phantom + Twitter both call. If the shape is correct the unfurl works.)
3. Verify a real OG image renders inside Discord/Twitter's preview box. (I can curl `/api/og?...` and inspect the PNG bytes.)

Everything else is in scope.

---

## B. The 3 personas (multi-wallet test infra)

I generate persistent burner keypairs once, then re-use them across every multi-wallet test:

```
apps/web/.test-wallet.json       → ALICE  (primary consumer)
apps/web/.test-merchant.json     → BOB    (recipient / merchant)
apps/web/.test-carol.json        → CAROL  (3rd group voter)
```

All three are gitignored. Bootstrap script:

```bash
pnpm tsx scripts/bootstrap-test-wallets.ts
# → generates the 3 keypairs if missing
# → solana airdrop 0.5 to each on devnet
# → fetches 25 USDC-dev from Circle faucet for ALICE + BOB
# → writes pubkeys to .test-personas.json for downstream tools
```

Connecting persona X in Playwright:

```ts
import { connectBurner } from "./helpers/connect-burner";
await connectBurner(page, "ALICE"); // selects the burner with ALICE's pubkey
```

The burner adapter reads the JSON files at boot; switching persona = pointing the env var.

---

## C. Per-area test strategy

### C.1 — UI smoke (every route)

```bash
pnpm exec playwright test e2e/route-smoke.spec.ts
```

Spec asserts each of the ~64 routes:
- HTTP 200 (or correct 404 for non-routes)
- has expected hero `<h1>` text
- W6 sidebar visible (or no sidebar if public/embed)
- no console errors during load
- no `text-foreground/X` resolving to the same color as bg (catches invisible text)
- no `bg-accent` rendered as default Tailwind green (catches palette regressions)

### C.2 — Cross-wallet flows

Each multi-wallet test spec runs as one Playwright test with multiple `browser.newContext()` — one per persona, parallel:

```ts
test("ALICE sends 5 USDC to BOB → BOB sees it within 5s", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  // ALICE side
  const alice = await aliceCtx.newPage();
  await connectBurner(alice, "ALICE");
  await alice.goto("/send");
  // ... fill + sign ...
  // BOB side (parallel)
  const bob = await bobCtx.newPage();
  await connectBurner(bob, "BOB");
  await bob.goto("/dashboard");
  await expect(bob.locator("text=+$5.00")).toBeVisible({ timeout: 5000 });
});
```

### C.3 — On-chain verification (parallel to UI assertion)

Every test that triggers a tx ALSO runs `verifyOnChain(sig)`:

```ts
async function verifyOnChain(sig: string) {
  const conn = new Connection("https://api.devnet.solana.com");
  const tx = await conn.getParsedTransaction(sig, "confirmed");
  expect(tx).not.toBeNull();
  expect(tx.meta.err).toBeNull();
  // assert: program ix data, transfer amount, memo, reference
}
```

### C.4 — DB verification

Every test that writes to Supabase runs `verifyDb(query)`:

```ts
async function verifyDb<T>(table: string, where: Record<string, unknown>): Promise<T> {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data } = await sb.from(table).select("*").match(where).maybeSingle();
  expect(data).not.toBeNull();
  return data as T;
}
```

### C.5 — Anchor instruction tests (15 ix)

Built as a Playwright spec that drives the UI through every ix path AND a parallel pure-Node script that crafts the ix directly via `@settle/sdk`:

```bash
pnpm tsx scripts/anchor-ix-coverage.ts
# → for each of 15 ix, builds a minimal valid call
# → submits via test wallet
# → asserts on-chain account state delta
# → asserts indexer wrote the expected receipts/policy_decisions row
```

### C.6 — Hash kernel parity (TS / Python / Rust)

```bash
pnpm tsx scripts/kernel-parity-cross-lang.ts
# → loads packages/test-fixtures/kernel-vectors.json
# → for each fixture:
#     - TS:    receiptKernel.compute(fixture)
#     - Python: subprocess "python -c 'from settle_sdk import compute; ...'"
#     - Rust:   subprocess "cargo run --bin kernel-cli -- <fixture>"
# → assert all 3 outputs byte-equal
```

### C.7 — All 50+ API endpoints

```bash
pnpm tsx scripts/api-coverage.ts
# → walks every file under apps/web/app/api/**/route.ts
# → for each:
#    - hit happy path with required auth/sig
#    - hit 401 path (missing auth)
#    - hit 400 path (missing field)
#    - hit 404 path (wrong id)
# → reports a coverage table
```

### C.8 — All 12 cron jobs

```bash
pnpm tsx scripts/cron-fire-all.ts
# → for each cron endpoint, POSTs with CRON_SECRET
# → asserts phase5_executions row appears
# → asserts side-effect (e.g., quorum_met spend fired, escrow released)
```

### C.9 — All 13 webhook events

Local receiver:

```bash
node scripts/webhook-receiver.ts &  # listens on :4000, logs + validates HMAC
```

Then trigger each event type via the corresponding flow. Receiver writes to a JSON log; assertion reads the log.

### C.10 — Push notifications

In Playwright, stub `navigator.serviceWorker` + `PushManager`:

```ts
await page.addInitScript(() => {
  window.__settlePushPayloads = [];
  // mock subscription
});
// trigger each push event, assert __settlePushPayloads received the right shape
```

### C.11 — All 3 SDKs (TS / Python / Rust)

TS:
```bash
cd packages/sdk && pnpm test
# unit + integration: 83 tests
```

Python:
```bash
cd packages/python-sdk && pytest -v
# kernel + canonical + ix data
```

Rust:
```bash
cd packages/rust-sdk && cargo test
# kernel parity + ix builder
```

Then full live integration test:

```bash
pnpm tsx scripts/sdk-integration-live.ts
# → installs each SDK in a temp dir
# → runs `await settle.pay({...})` with real burner key
# → asserts: receipt confirmed in <5s, hash matches /api/verify
```

### C.12 — All 6 MCP tools

```bash
pnpm tsx scripts/mcp-coverage.ts
# → spawns @settle/mcp as child process over stdio
# → sends JSON-RPC initialize, listTools
# → for each of 6 tools: settle.pay / verify / list_capabilities / open_pact / close_pact / refund
#    sends a minimal valid call
#    asserts JSON response + on-chain side effect
```

### C.13 — Solana Actions / Blinks

```bash
pnpm tsx scripts/blink-coverage.ts
# → curl /api/actions/hire/research → asserts ActionGetResponse shape (icon, label, links[])
# → curl POST /api/actions/hire/research/spawn with account → asserts serialized Tx returned
# → decodes the Tx, sends to devnet, confirms
```

### C.14 — Solana Pay QR

```bash
pnpm tsx scripts/pay-qr-coverage.ts
# → render a QR on /request, screenshot the canvas
# → decode with jsqr → assert the solana: URL matches expected reference, amount, label
# → use @solana/pay parseURL to validate
# → simulate ALICE scanning: fetch the URL, build Tx, sign with ALICE burner, send
# → assert reference resolves via getSignaturesForAddress
```

### C.15 — Federation

```bash
pnpm tsx scripts/federation-coverage.ts
# → seed a fake federation_origins row with attestation pubkey
# → POST a federated_receipt with a valid attestation sig
# → indexer accepts, status=verified
# → operator promotes via /admin/federation/promote
# → ALICE on /ledger sees federated_trusted bucket
# → operator demotes → bucket flips to federated_untrusted
```

### C.16 — Mobile (390px)

Playwright with explicit viewport:

```ts
test.use({ viewport: { width: 390, height: 844 } });
```

Per route:
- assert no horizontal scroll
- assert tap-target sizes ≥ 44px
- assert sidebar collapses to bottom-tab

### C.17 — Browser compat

```bash
pnpm exec playwright test --project=chromium
pnpm exec playwright test --project=firefox
pnpm exec playwright test --project=webkit
```

(Firefox + WebKit projects need adding to `playwright.config.ts` — task to do.)

### C.18 — Lighthouse (perf)

```bash
pnpm tsx scripts/lighthouse.ts
# → runs Lighthouse against /, /dashboard, /verify, /m/me
# → asserts perf ≥ 90, a11y ≥ 95, best-practices ≥ 95
```

### C.19 — Visual regression

```bash
pnpm exec playwright test e2e/visual-regression.spec.ts
# 27 baselines across desktop / tablet / mobile
```

If a page changes intentionally:

```bash
pnpm exec playwright test e2e/visual-regression.spec.ts --update-snapshots
```

### C.20 — TypeScript / lint / build

```bash
pnpm tsc --noEmit
pnpm lint
pnpm build
```

All three must exit 0.

### C.21 — IDL drift (CI gate)

```bash
pnpm tsx scripts/verify-idl.ts
# → reads programs/settle-agent-card/target/idl/settle_agent_card.json
# → reads packages/sdk/src/idl.ts
# → asserts byte-equal
```

### C.22 — Security audit

```bash
pnpm tsx scripts/security-audit.ts
# → grep .next/ build output for accidental privkey/secret leaks
# → headers test: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
# → CORS test: only same-origin allowed for auth endpoints
# → rate-limit test: 11 requests/min to /api/auth/challenge → 11th gets 429
```

---

## D. Master test runner

One command runs everything, in dependency order:

```bash
pnpm test:full
```

Defined in root `package.json` as:

```json
"test:full": "pnpm tsc --noEmit && pnpm lint && pnpm test:unit && pnpm test:e2e && pnpm tsx scripts/test-full-suite.ts"
```

`scripts/test-full-suite.ts` orchestrates:

1. **Pre-flight** — `solana balance` for each persona, `pnpm db:migrate`, indexer health
2. **Unit** — kernel parity, IDL drift, SDK unit (TS+Py+Rust)
3. **API coverage** — every endpoint
4. **Anchor ix coverage** — all 15 ix
5. **Cron** — fire all 12, assert side effects
6. **Webhook** — start receiver, fire all 13 events, assert delivery
7. **MCP** — all 6 tools
8. **SDK integration** — TS + Py + Rust each make 1 real spend
9. **Blink** — fetch + decode + submit
10. **Solana Pay QR** — render + decode + pay
11. **Federation** — promote/demote/verify
12. **Cross-wallet UI** — Playwright multi-context flows (sends, group, allowance, split, escrow)
13. **Visual regression** — 27 baselines
14. **Mobile** — 390px sweep
15. **Lighthouse** — perf gates
16. **Security** — header + leak scan
17. **Final report** — pass/partial/fail per section, written to `docs/testing/RESULTS.md`

If any step fails: stop, log the failure with reproduction steps, drop the user a tight summary.

---

## E. State + cleanup discipline

**Before every test run:**

```bash
pnpm tsx scripts/test-reset.ts
# → truncates test-only Supabase tables (NOT receipts, audit, real ledger)
# → reclaims rent from leftover test pacts (close_pact for any pact with scope_label like 'test-%')
# → snapshots .test-wallet balances so we can detect leaks
```

**After every test run:**

```bash
pnpm tsx scripts/test-leak-check.ts
# → diffs balances against snapshot
# → flags any pact PDA still open
# → flags any escrow not released or refunded
```

---

## F. What I do when a test fails

Per the user's standing instruction: **no shallow "everything works" claims**.

For every failure:

1. Capture the exact reproduction (URL, payload, signed message, onchain sig)
2. Read the relevant source file(s) end-to-end (not just the failing line)
3. Read the relevant docs in `docs/audit/`, `docs/testing/`, `MAINNET_MIGRATION.md`
4. Identify root cause (not symptom)
5. Fix the root cause
6. Re-run the failing test alone, then the full sub-suite
7. If the fix touched cross-cutting code: re-run the full suite
8. Log the fix in `docs/testing/RESULTS.md` with: file changed, why, before → after

Never:
- Disable a failing test
- Skip a flaky one without root-cause investigation
- Add `// TODO: figure this out later`
- Mock around a real bug
- Claim something works when only a happy path passes

---

## G. Where everything lives

```
docs/testing/
  TEST_PLAN.md          ← what to test (~250 cases)
  AUTOMATED_TESTING.md  ← this file: tools + how
  RESULTS.md            ← per-test pass/fail (overwritten each run)

scripts/
  bootstrap-test-wallets.ts
  test-reset.ts
  test-leak-check.ts
  anchor-ix-coverage.ts
  api-coverage.ts
  cron-fire-all.ts
  kernel-parity-cross-lang.ts
  mcp-coverage.ts
  blink-coverage.ts
  pay-qr-coverage.ts
  federation-coverage.ts
  sdk-integration-live.ts
  webhook-receiver.ts
  lighthouse.ts
  security-audit.ts
  test-full-suite.ts    ← the orchestrator

apps/web/e2e/
  route-smoke.spec.ts
  visual-regression.spec.ts
  multi-wallet/
    send.spec.ts
    group.spec.ts
    allowance.spec.ts
    split-bill.spec.ts
    escrow.spec.ts
  helpers/
    connect-burner.ts
    verify-onchain.ts
    verify-db.ts
```

(Some of those scripts don't exist yet — building them is part of the run, not a blocker.)

---

## H. The greenlight gate

Before claiming "ready to submit":

```bash
pnpm test:full
```

Must exit 0. Then:

```bash
cat docs/testing/RESULTS.md
# → every section: "✓ pass"
# → 0 partial
# → 0 fail
```

Anything else means we're not done.
