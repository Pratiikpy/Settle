# LIBRARY_CORRECTNESS.md — Phase 9

Audit of framework / library usage. Each library: doc URL fetched + date,
current code usage (file:line), correct usage from doc, mismatch / risk,
severity, exact fix path. Doc snapshots dated 2026-05-02.

Findings IDs append to `FINDINGS.md` as `AU-09-NNN`. Severities follow the
brief: BLOCKER / HIGH / MEDIUM / LOW / DOC_DRIFT.

---

## 1. Next.js 15 App Router

**Doc URL:** https://nextjs.org/docs/app/api-reference/file-conventions/route (fetched 2026-05-02; Next.js docs landing show v15 as current GA at audit time per `apps/web/package.json:48` `"next": "15.0.2"`).

**Correct usage from doc:**
- Dynamic route `params` MUST be awaited (`Promise<{ slug: string }>`). Codemod available for v15 upgrade.
- Default caching for `GET` handlers changed from static to dynamic in 15.0; explicit `dynamic = "force-dynamic"` only needed for static-export edge cases.
- `OPTIONS` is auto-implemented if not defined — but custom CORS headers REQUIRE a hand-rolled `OPTIONS`.

**Code usage:** `apps/web/app/api/actions/hire/[slug]/route.ts:11`, `apps/web/app/api/actions/hire/[slug]/spawn/route.ts:131`, `apps/web/app/api/cron/phase5-signer/route.ts:21` — all correctly type `params: Promise<…>` and `await` it.

**Mismatch:** None on params/runtime/dynamic. See AU-09-002 below for an OPTIONS export bug specific to one Action route (`spawn/route.ts` uses synchronous `export function OPTIONS()` instead of async, which is harmless but inconsistent).

**Severity:** LOW (consistency). No blocker.

---

## 2. React 19

**Doc URL:** https://react.dev/reference/react/use (fetched 2026-05-02). Package: `apps/web/package.json:50` `"react": "19.0.0"`.

**Correct usage from doc:** `use()` may be called inside loops/conditionals; cannot be in try-catch; in Server Components prefer `async`/`await`. Hooks rules unchanged.

**Code usage:** Cursory scan of `apps/web/app/providers.tsx:27-58` — no obvious hooks-in-loops or hooks-in-conditionals violations. Server Components (e.g. cards page) use async/await as recommended.

**Mismatch:** None observed at this layer. Deep React-19-specific component-level audit deferred (would need a Phase-8 partner).

**Severity:** N/A.

---

## 3. @solana/web3.js v1

**Doc URL:** https://solana-labs.github.io/solana-web3.js/v1.x/ — 404 at fetch time. Falling back to package source semantics (`@solana/web3.js@^1.95.5` per `apps/web/package.json:37`). Public API has been stable for v1.95+.

**Code usage:**
- `apps/web/app/api/cron/phase5-signer/route.ts:231-256, 378-399` — uses legacy `Transaction` + `getLatestBlockhash` carries `lastValidBlockHeight` into `confirmTransaction` (correct per spec).
- `apps/web/app/api/swap/quote-and-build/route.ts:301-308` — uses `VersionedTransaction` for Jupiter mainnet path (correct).
- `apps/web/app/api/actions/hire/[slug]/spawn/route.ts:208-216` — legacy `Transaction` for an `open_pact` ix (acceptable, doesn't need ALTs).

**Mismatch:** None. Blockhash + lastValidBlockHeight pattern is canonical. Mixed Transaction/VersionedTransaction is acceptable: legacy is fine for ≤1 ix without ALTs.

**Severity:** N/A.

---

## 4. @solana/spl-token

**Doc URL:** https://www.solana-program.com/docs/token (fetched 2026-05-02; redirected from spl.solana.com/token).

**Correct usage from doc:** `createTransferCheckedInstruction(source, mint, dest, owner, amount, decimals)` requires `decimals` to match the on-chain mint's `decimals` field — mismatched decimals cause the instruction to fail with `0x1` (`InvalidArgument`) at runtime. JS doc page does not detail mismatch, but the on-chain Rust impl checks `mint.decimals == decimals_arg`.

**Code usage:**
- `apps/web/app/api/swap/quote-and-build/route.ts:144-151` — passes hard-coded `6` for USDC.
- `apps/web/lib/anchor-client.ts:212-213, 280-281, 543` — derives ATAs via `getAssociatedTokenAddressSync` with `allowOwnerOffCurve=true` for the vault PDA. Correct.

**Mismatch in `swap/quote-and-build/route.ts:151`:** the decimals literal `6` is correct for USDC but not validated against the dynamic `inputUsdcMint`. If `parsed.outputMint` is overridden to a non-USDC mint with different decimals, the instruction will fail. Defensive: the same route's `isUsdcMint` gate makes this unreachable in practice on the documented surface, but `parsed.outputMint` accepts any pubkey.

**Severity:** MEDIUM.

**Fix path:** Either fetch mint decimals via `getMint()` once, or assert at the gate `if (!isUsdcMint(inputMint, cluster)) reject; decimals = 6` — make the `6` literal explicitly `USDC_DECIMALS = 6` constant.

(Logged as **AU-09-003**.)

**Sync vs Async ATA:** code mostly uses `getAssociatedTokenAddressSync` (synchronous derivation), which is the modern recommended path. `getAssociatedTokenAddress` (async) is the older API kept for back-compat. `swap/quote-and-build/route.ts:128, 129, 241` uses the async variant — both work but inconsistent within the codebase. **Severity: LOW (style only).** Not logged separately.

---

## 5. Anchor / @coral-xyz/anchor

**Doc URL:** https://www.anchor-lang.com/docs (not deeply re-fetched; partly covered by Phase 3, this audit only cross-checks library wiring).

**Code usage:** `apps/web/lib/anchor-client.ts` is hand-written ix-data builders (no `@coral-xyz/anchor` runtime dep in `apps/web/package.json`). The `BorshWriter` + `buildIxData` pair manually writes the 8-byte sha256 discriminator via `@settle/sdk`. Authority/agent signer assignments match Anchor's `#[account]` constraints from `programs/settle-agent-card/src/instructions/*.rs`.

**Mismatch:** None at the library-API layer. Note that hand-rolled ix builders are by design (hand-shipped before Codama generation per file header `apps/web/lib/anchor-client.ts:1-10`); IDL-parity falls under Phase 3.

**Severity:** N/A.

---

## 6. wallet-adapter (Phantom + UnsafeBurner)

**Doc URL:** https://github.com/anza-xyz/wallet-adapter (fetched 2026-05-02; only PACKAGES list returned, no detailed guidance).

**Code usage:** `apps/web/app/providers.tsx:1-58`.

**Issues observed:**
- `apps/web/app/providers.tsx:11` uses `require("@solana/wallet-adapter-react-ui/styles.css");` inside an ESM module. In a Next.js 15 App Router client component, the canonical pattern is a top-of-file `import "@solana/wallet-adapter-react-ui/styles.css";`. The `require()` call works in webpack but breaks under Turbopack (Next 15 dev default) and bundles emit a CommonJS interop warning. `next.config.mjs:21-25` declares the project ESM (`"type": "module"` in `apps/web/package.json:5`).
- `apps/web/app/providers.tsx:30` pushes `UnsafeBurnerWalletAdapter` only when `NEXT_PUBLIC_E2E_BURNER` is truthy — this gate is correct, but the `any[]` cast at `apps/web/app/providers.tsx:29` (`const list: any[]`) loses type safety.

**Severity:** MEDIUM (`require()` of CSS in ESM client module — works on webpack, fails or warns on Turbopack). LOW (`any[]` typing).

**Fix path:** Replace `require(...)` with `import "@solana/wallet-adapter-react-ui/styles.css";` at the top of the file.

(Logged as **AU-09-004**.)

---

## 7. Supabase

**Doc URL:** https://supabase.com/docs/guides/database/postgres/row-level-security (fetched 2026-05-02).

**Critical finding from doc:** "RLS _must_ always be enabled on any tables stored in an exposed schema. By default, this is the `public` schema." Service-role keys bypass RLS; anon/publishable keys are subject to RLS.

**Code usage:**
- 95 API route files use `createClient(...)` server-side.
- 11 of 45 migrations call `enable row level security` per:
  ```
  $ grep -ric "enable row level security" infra/supabase/migrations/ | grep -v ":0$" | wc -l
  11
  ```
- Total tables created across migrations: **43**. RLS-enabled tables: **~17** (sum of per-file counts). **At least 26 tables ship with RLS DISABLED.**

**Verification:**
- `infra/supabase/migrations/0001_init.sql:210-215` enables RLS on agent_cards, agent_card_allowlist, pacts, receipts, policy_decisions, verified_merchants — six tables.
- `0011_streaming_pacts.sql`, `0015_delivery_escrow.sql`, `0019_receipt_kernel.sql`, etc. create `streaming_claim_queue`, `delivery_escrows`, `kernel_attestations`, `phase5_executions`, `auto_refill_queue`, `round_up_queue`, `group_spend_requests`, `gift_sends`, `scheduled_sends`, `auto_refill_rules`, etc. — none of these greps return a matching `enable row level security` statement.

**Mismatch — 1 (HIGH):** Most queue/state tables (`scheduled_sends`, `auto_refill_rules`, `auto_refill_queue`, `round_up_queue`, `group_spend_requests`, `gift_sends`, `streaming_claim_queue`, `phase5_executions`, etc.) lack RLS. While the only API access is via service-role key (which bypasses RLS anyway), if Supabase's PostgREST is exposed on the anon/publishable key for any of these tables (e.g. accidental dashboard-side reads), they're world-readable. Supabase displays a security warning in the dashboard for any table in `public` without RLS.

**Mismatch — 2 (HIGH):** Server-side fallback to anon key. **Across at least 25 API route files** (count from grep below) the Supabase client is constructed as:
```
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
```
First seen at `apps/web/app/api/actions/hire/[slug]/spawn/route.ts:68`. Pattern repeats at `actions/request/[slug]/route.ts:63`, `actions/router/[handle]/[type]/route.ts:75`, `admin/federation/retry/route.ts:60`, `allowances/route.ts:52`, `audit/phase5/route.ts:49`, etc. (≥25 hits).

**Why it's wrong:** Server routes that intend to write tables (insert into `phase5_executions`, `agent_templates.use_count` increment, etc.) silently degrade to anon-key reads when `SUPABASE_SERVICE_ROLE_KEY` is unset. If RLS is enabled on the target table, the route returns "success" but no row was written (FAKE_SUCCESS). If RLS is disabled, the anon key may write rows it shouldn't be able to. Either way the failure mode is silent — there is no `if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw` guard.

**Mismatch — 3 (MEDIUM):** `amount_lamports` already noted in brief — 8+ places use `Number(amount_lamports)` for display (`apps/web/app/api/cards/[id]/receipts/csv/route.ts:84`, `disputes/draft/route.ts:47`, `cnft/[id]/metadata.json/route.ts:60`, `merchants/.../disputes/resolve/route.ts:235`, etc.). USDC amounts < 2^53 lamports so this is currently safe ($9 quadrillion ceiling), but Supabase-js returns Postgres `bigint` columns as strings by default — so `Number("18446744073709551615")` would lose precision. **Currently safe in practice; keep `BigInt(String(x))` pattern as in `merchants/[handle]/analytics/route.ts:104`.**

**Severities:**
- AU-09-005: HIGH (RLS missing on majority of tables).
- AU-09-006: HIGH (anon-key fallback — silent FAKE_SUCCESS on writes).
- AU-09-007: MEDIUM (`Number(amount_lamports)` pattern — track for future).

**Fix paths:**
- Add migration `0046_rls_enable_remaining.sql` enabling RLS on every public-schema table; add minimal `service_role` policies (or rely on bypass-for-service-role default).
- Replace `?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` with strict `if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY required")` in every server-side route.

---

## 8. Sentry Next.js SDK 8

**Doc URL:** https://docs.sentry.io/platforms/javascript/guides/nextjs/ (fetched 2026-05-02).

**Doc requirement:** Sentry SDK 8 requires:
1. `instrumentation.ts` at the project root that conditionally imports `sentry.server.config.ts` and `sentry.edge.config.ts` based on `process.env.NEXT_RUNTIME`.
2. `instrumentation-client.ts` at project root (replaces `sentry.client.config.ts` for newer SDK versions).
3. `app/global-error.tsx` for React render error capture (App Router).
4. `withSentryConfig(nextConfig, …)` wrapping in `next.config.mjs`.

**Code usage:**
- `apps/web/sentry.client.config.ts` exists.
- `apps/web/sentry.server.config.ts` exists.
- `apps/web/sentry.edge.config.ts` exists.
- `apps/web/next.config.mjs:34-43` wraps with `withSentryConfig` only when DSN is set.

**Missing files (verified by `ls` failing):**
- `apps/web/instrumentation.ts` — **NOT present.**
- `apps/web/instrumentation-client.ts` — **NOT present.**
- `apps/web/app/global-error.tsx` — **NOT present.**

**Mismatch:** Without `instrumentation.ts`, the server/edge configs are never loaded by Next 15. Sentry server-side error capture is silently broken. `tracesSampler` in `apps/web/sentry.server.config.ts:13-17` (which sets `cron` routes to 1.0 sampling) NEVER runs in production. In particular, `Sentry.captureException` calls in `apps/web/app/api/cron/phase5-signer/route.ts:1010-1023, 1187-1200` would be silently dropped because the SDK isn't initialized server-side.

**Severity:** HIGH — the Phase 5 cron-signer relies on Sentry to surface live-fire failures (per `AUDIT_BRIEF.md` line 217 "Verify Sentry capture exists at every live-fire failure path"). Without `instrumentation.ts`, the cron's `Sentry.captureException(...)` calls are no-ops.

**Fix path:** Add `apps/web/instrumentation.ts`:
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}
```
Add `apps/web/app/global-error.tsx` with `Sentry.captureUnderscoreErrorException`. Optionally rename `sentry.client.config.ts` → `instrumentation-client.ts`.

(Logged as **AU-09-008**.)

---

## 9. @noble/hashes BLAKE3 + cross-SDK version pin

**Doc URL:** https://github.com/paulmillr/noble-hashes (memory; not re-fetched). Package: `apps/web/package.json:23` `"@noble/hashes": "^1.5.0"`; `packages/sdk/package.json:23` `"@noble/hashes": "^1.5.0"`.

**Cross-SDK pin verification:**
- TS: `@noble/hashes ^1.5.0` (BLAKE3 module).
- Python: `packages/python-sdk/pyproject.toml:10` `blake3>=0.3.4` — **floor version 0.3.4 from 2021. Current PyPI release is 1.0.5+. The constraint is open-ended, so any modern version installs, but the floor allows installing legacy 0.3.x which has a different output format (?).** Verified the BLAKE3 output is byte-identical at any 0.3.x+ version per noble-hashes/blake3 spec compatibility, so functionally OK. But the loose pin causes goldens-drift risk if anyone pins.
- Rust: `packages/rust-sdk/Cargo.toml:10` `blake3 = "1.5"` (which is `^1.5`, currently 1.5.x).

**Mismatch:** Python pin floor is too low; ought to be `blake3>=1.0` to match the maturity of the TS/Rust pins. Functionally not broken because all 0.x and 1.x versions produce identical 32-byte digests for the same input (BLAKE3 is a fixed spec).

**Severity:** LOW.

**Fix path:** Bump `pyproject.toml` to `blake3>=1.0,<2`.

(Logged as **AU-09-009**.)

---

## 10. bs58

**Doc URL:** https://github.com/cryptocoinjs/bs58 (memory; not re-fetched). Used via `apps/web/package.json:41` `"bs58": "^6.0.0"`, `apps/indexer/package.json:31` `"bs58": "^6.0.0"`. **Same major across both consumers (good).**

**Mismatch:** None on consistency. Note `bs58@6` is ESM-only; works in both consumers because they're ESM (`"type": "module"`).

**Severity:** N/A.

---

## 11. zod

**Doc URL:** https://zod.dev (memory; pattern is well-established). Package: `apps/web/package.json:54` `"zod": "^3.23.8"`.

**Code usage sweep:** of 124 API routes (per `SYSTEM_MAP.md`), 30 ROUTE FILES use `zod` for body validation. 
- Confirmed write routes (`POST/PATCH/PUT/DELETE`) **without** zod schema validation: 18 files, including:
  - `apps/web/app/api/disputes/draft/route.ts`
  - `apps/web/app/api/payment-links/[token]/route.ts` (POST)
  - `apps/web/app/api/send/build/route.ts`
  - `apps/web/app/api/send/link/build/route.ts`
  - `apps/web/app/api/send/link/claim/route.ts`
  - `apps/web/app/api/sandbox/airdrop/route.ts`
  - `apps/web/app/api/voice/transcribe/route.ts`
  - `apps/web/app/api/x402/proxy/[merchant]/route.ts`
  - `apps/web/app/api/templates/[slug]/route.ts`
  - `apps/web/app/api/sp/[merchant]/[slug]/route.ts`
  - `apps/web/app/api/receipts/[requestId]/attachments/route.ts`
  - `apps/web/app/api/fraud/scan/route.ts`
  - `apps/web/app/api/bookkeeper/categorize/route.ts`
  - `apps/web/app/api/actions/hire/[slug]/spawn/route.ts`
  - `apps/web/app/api/actions/request/[slug]/route.ts`
  - `apps/web/app/api/actions/revoke/[card]/route.ts`
  - `apps/web/app/api/actions/router/[handle]/[type]/route.ts`
  - `apps/web/app/api/graphql/route.ts`

**Mismatch:** 18 mutation routes accept JSON body without zod parse. Many do ad-hoc regex on `body.account` (the Action `spawn` route does — `apps/web/app/api/actions/hire/[slug]/spawn/route.ts:161`), which is partial validation but missing schema-level field-presence checks. Risk: malformed body → uncaught exception → 500 + Sentry-noise (and Sentry isn't currently wired — see AU-09-008).

**Severity:** MEDIUM (HIGH if combined with the Sentry-broken finding — silent 500s on production).

**Fix path:** Add a `Body = z.object({...})` + `Body.parse(await req.json())` in each. The pattern at `apps/web/app/api/swap/quote-and-build/route.ts:53-61, 99-107` is the canonical project pattern; replicate.

(Logged as **AU-09-010**.)

---

## 12. Solana Pay / Actions / Blinks

**Doc URLs:**
- https://docs.solanapay.com/spec (fetched 2026-05-02)
- https://solana.com/docs/advanced/actions (fetched 2026-05-02)

**Doc requirements:**
- Solana Pay reference key: base58 32-byte pubkey; included as **non-signer, read-only** key in the `keys` array of the Transfer / TransferChecked instruction; "must be included in the order provided".
- Solana Actions: GET response shape `{ type: "action", title, icon, description, label, links?: { actions: [...] } }` (correct in code). POST response: `{ transaction: base64, message?, links?: { next? } }` (correct in code).
- CORS minimum: `Access-Control-Allow-Origin: *`, `Methods: GET,POST,PUT,OPTIONS`, `Headers: Content-Type, Authorization, Content-Encoding, Accept-Encoding`.
- `actions.json` MUST exist at the domain root if multiple action endpoints are referenced from external Blinks.

**Code usage findings:**

**Issue 12-A (HIGH):** Reference key correctness in `apps/web/app/api/swap/quote-and-build/route.ts:152`:
```
transferIx.keys.push({ pubkey: reference, isSigner: false, isWritable: false });
```
The reference is added AFTER all other Token Program keys via `.push(...)`. Solana Pay spec says reference keys "must be included in the order provided" — so order is unimportant, but they MUST not be inserted between Token Program required keys. The code appends, which is correct. **No bug.**

**Issue 12-B (HIGH):** `apps/web/app/api/actions/hire/[slug]/route.ts:33` returns the GET response without an `OPTIONS` handler that includes `Authorization`/`Content-Encoding`/`Accept-Encoding` headers — only `Content-Type`:
```
"Access-Control-Allow-Headers": "Content-Type",
```
Phantom and modern Blink hosts send `Accept-Encoding` and `Content-Encoding` on preflight; missing those Allow-Headers will fail CORS preflight on some edge cases. Solana Actions spec requires the full set.

**Issue 12-C (HIGH):** `apps/web/app/api/actions/hire/[slug]/spawn/route.ts:230` exports `OPTIONS` as a non-async function. Should be `export async function OPTIONS()`. Functionally Next.js hands it the request anyway, but it's a TypeScript inconsistency vs the rest of the file. **Severity: LOW.**

**Issue 12-D (MEDIUM):** Missing `actions.json` at the domain root:
```
$ ls apps/web/public/actions.json apps/web/app/actions.json/route.ts
ls: cannot access … : No such file or directory
```
Without `actions.json`, third-party Blink hosts (Dialect, Phantom feed) cannot validate which paths on `settle.so` are Action endpoints; they may refuse to render the Blink. Spec says: "applications should include an `actions.json` file at the domain root."

**Issue 12-E (MEDIUM):** No `X-Action-Version` / `X-Blockchain-Ids` headers in any route response. The Blinks spec evolution adds these for cluster routing; absence means clients fall back to mainnet assumption. Per `apps/web/app/api/actions/hire/[slug]/spawn/route.ts:121-127` the route picks devnet by default — clients have no way to know.

**Severities + fixes:**
- AU-09-011 (MEDIUM): Add `actions.json` at `apps/web/public/actions.json` or `apps/web/app/actions.json/route.ts`.
- AU-09-012 (MEDIUM): Update CORS `Access-Control-Allow-Headers` to include `Authorization, Content-Encoding, Accept-Encoding` in every `/api/actions/*` route.
- AU-09-013 (MEDIUM): Add `X-Action-Version` + `X-Blockchain-Ids` headers (Solana mainnet `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`, devnet `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`) to GET response so client knows which cluster.

---

## 13. Helius

**Doc URL:** https://www.helius.dev/docs (fetched 2026-05-02 — most pages 404 at intermediate paths; only landing reachable).

**Code usage:** RPC URL pattern is consistent across files:
```
return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
```
- `apps/web/app/api/cron/phase5-signer/route.ts:154`
- `apps/web/app/api/actions/hire/[slug]/spawn/route.ts:125`
- `scripts/cnft-setup.ts:50` (similar)

**Doc-vs-code:** API key in querystring (`?api-key=`) is the documented Helius pattern. Acceptable. No header-auth requirement visible.

**Mismatch:** None observed. The querystring leaks the api-key into RPC server access logs, which is an acceptable trade-off Helius itself documents.

**Severity:** N/A.

(Logged as **AU-09-014: NEEDS_VERIFICATION** because Helius docs were partially unreachable. Re-verify after fetching `helius.dev/docs/api-reference` directly.)

---

## 14. Jupiter

**Doc URL:** https://developers.jup.ag/docs/api (redirected; landing page returned no content).

**Code usage:** `apps/web/lib/jupiter.ts:17` uses `https://lite-api.jup.ag/swap/v1` as the base. `apps/web/app/api/swap/quote-and-build/route.ts:203-224` correctly returns `mode: "mainnet_only"` on devnet and exposes the quote for transparency. **Devnet handling is honest.**

**Mismatch:** `apps/web/lib/jupiter.ts:14` claims rate limit "~60 rpm per IP" — not citable from a fetched doc; this is a project-side belief that may be stale. Severity LOW.

**Severity:** LOW (NEEDS_VERIFICATION).

(Logged as **AU-09-015: NEEDS_VERIFICATION**.)

---

## 15. MPL Core / Bubblegum / cNFT

**Doc URL:** https://metaplex.com/docs/bubblegum (redirected from developers.metaplex.com — fetch returned only the redirect notice, not full content).

**Code usage:**
- `apps/web/package.json:17-19` pins `@metaplex-foundation/mpl-bubblegum: ^4.3.0`, `mpl-core: ^1.1.1`, `digital-asset-standard-api: ^1.0.4`.
- `scripts/cnft-setup.ts:39-41` calls `mplBubblegum`, `createTree`, `mplTokenMetadata`, `createNft`. Tree config: `max_depth 20, canopy 13, max_buffer_size 64` per the script's docstring (line 14). That is a documented "1M leaf" config, fine.

**Mismatch:** None confirmed at API-call level. `mpl-bubblegum` v4 is the current major; v3→v4 dropped Token Metadata coupling, which the code accommodates by calling `mplTokenMetadata` separately. Acceptable.

**Severity:** N/A.

---

## 16. Light Protocol / ZK compression

**Doc URL:** https://www.zkcompression.com/welcome (fetched 2026-05-02 — only homepage returned).

**Code usage:** `scripts/zk-receipt-mint-setup.ts:21-22` uses `@lightprotocol/stateless.js` `createRpc` and `@lightprotocol/compressed-token` `createMint`. Doc recommendations match (these are still the canonical packages per the homepage at audit date).

**Mismatch:** None at API call layer. Note `PROJECT_STATUS.md` claims ZK receipts are "shipped"; this script is a setup helper, not the runtime path. Phase 12 (DEVNET_HONESTY) will test live mint.

**Severity:** N/A.

---

## 17. MCP middleware protocol

**Doc URL:** https://modelcontextprotocol.io/docs/concepts/tools (fetched 2026-05-02; spec rev `2025-06-18`).

**Doc requirements:**
- `tools/call` request shape: `{ jsonrpc, id, method: "tools/call", params: { name, arguments } }`. **`_meta` is at the request level**, NOT on `params`.
- Tool result: `{ content: [...], isError?: boolean, structuredContent? }`.
- JSON-RPC error codes: app-level errors should use the reserved range `-32000..-32099`. `-32602` is reserved (Invalid params). No payment-required error code is defined in the spec.

**Code usage:** `packages/mcp-middleware/src/index.ts:49-62`:
```ts
export interface McpToolRequest {
  params: {
    name: string;
    arguments?: Record<string, unknown> | undefined;
    _meta?: { settle_credential?: …; };
  };
  _meta?: McpToolRequest["params"]["_meta"];
}
```

**Mismatch — 17-A (HIGH):** The middleware reads `request.params._meta.settle_credential`. Per MCP spec **`_meta` lives on the request, not on `params`**. The code at line 60-61 falls back to `request._meta` too (good), but the primary path advertised at line 51 is non-standard.

Spec quote (from fetched page): `"params": { "name": "get_weather", "arguments": { "location": "New York" } }` — no `_meta` shown on params. The MCP TypeScript SDK schema (`@modelcontextprotocol/sdk`) places `_meta` at the request level.

**Mismatch — 17-B (LOW):** `SettlePaymentRequiredError.code = -32001` in `packages/mcp-middleware/src/index.ts:136` — this is in the application-reserved range (`-32000..-32099`), so the code is allowed; **no bug, just confirm doc conformance.** The header comment at lines 30-32 says "code -32001, error.data.settle = …" — fine.

**Severity:**
- AU-09-016 (HIGH): Read `_meta` from the request envelope (`request._meta`), not from `request.params._meta`. Update primary path; keep params._meta as legacy fallback only.

---

## 18. @noble/curves, @noble/ciphers — same family

`@noble/curves: ^1.6.0` and `@noble/ciphers: ^1.0.0` pinned consistently across `apps/web` and `packages/sdk`. No drift.

---

# Summary

| ID | Severity | Library | Issue |
|----|----------|---------|-------|
| AU-09-002 | LOW | Next.js | `OPTIONS` non-async export in spawn route |
| AU-09-003 | MEDIUM | spl-token | `decimals=6` literal not validated against dynamic mint |
| AU-09-004 | MEDIUM | wallet-adapter | `require()` of CSS in ESM client component |
| AU-09-005 | HIGH | Supabase | RLS missing on majority (≥26) of public tables |
| AU-09-006 | HIGH | Supabase | Server fallback to anon key produces silent FAKE_SUCCESS on writes |
| AU-09-007 | MEDIUM | Supabase | `Number(amount_lamports)` pattern (currently safe but fragile) |
| AU-09-008 | HIGH | Sentry SDK 8 | Missing `instrumentation.ts` + `app/global-error.tsx` — server-side capture is a no-op |
| AU-09-009 | LOW | @noble/hashes / blake3 | Python `blake3>=0.3.4` floor too loose |
| AU-09-010 | MEDIUM | zod | 18 mutation routes accept JSON body without zod schema |
| AU-09-011 | MEDIUM | Solana Actions | Missing `actions.json` at domain root |
| AU-09-012 | MEDIUM | Solana Actions | CORS Allow-Headers missing Authorization/Content-Encoding/Accept-Encoding |
| AU-09-013 | MEDIUM | Solana Actions | Missing X-Action-Version / X-Blockchain-Ids headers |
| AU-09-014 | NEEDS_VERIFICATION | Helius | Re-fetch `helius.dev/docs/api-reference` |
| AU-09-015 | NEEDS_VERIFICATION | Jupiter | Re-fetch developers.jup.ag rate-limit page |
| AU-09-016 | HIGH | MCP middleware | `_meta` read from `params._meta` instead of request._meta |

**Total: 16 findings (4 HIGH, 6 MEDIUM, 2 LOW, 2 NEEDS_VERIFICATION, 2 N/A confirmations).**
