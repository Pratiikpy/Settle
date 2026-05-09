# HALF_BAKED.md — pre-launch brutal audit

Synthesized from six parallel sub-agent audits run on 2026-05-09. Findings are categorized by **layer** (Frontend / Docs / Backend / DB / Anchor / Security) and **severity** (CRITICAL / HIGH / MEDIUM / LOW / NIT). Every entry has a file path or URL anchor for evidence.

CRITICAL = "do not launch with this on the page." HIGH = "ship will embarrass us, fix in week 1." MEDIUM = "polish before paid customers." LOW / NIT = "fold into normal sprint work."

Audit scope:
- `https://use-settle.vercel.app` (live production)
- `apps/web/`, `apps/demo-merchants/`, `apps/indexer/`
- `packages/sdk`, `packages/python-sdk`, `packages/rust-sdk`, `packages/mcp-middleware`
- `programs/settle-agent-card/` (Anchor)
- `infra/supabase/migrations/`
- `README.md`, `PROOF.md`, `docs/**.md`, on-page docs at `/docs`

---

## CRITICAL — do not launch like this

### F-C1. `/admin/health` is publicly readable, currently RED, leaks operator stack traces
- File: `apps/web/app/admin/health/page.tsx:51`, live URL `https://use-settle.vercel.app/admin/health`
- Anyone hitting that URL today sees: 0 confirmed in last 20 cron runs, indexer lag 22h, Anchor stack traces in `error_message` column. No auth, no operator-secret gate, no `noindex`.
- **Fix:** gate behind `CRON_SECRET` query param check OR move to `/admin/health` middleware that rejects without a wallet-signed admin pubkey. Until then, return 503 from the page when health is red so a visitor doesn't read the failure list.

### F-C2. Five primary nav pages render an empty body on first paint
- Pages: `/docs`, `/capabilities`, `/feed`, `/leaderboard`, `/capabilities/discover`, `/dashboard?demo=1`
- All client-rendered, no SSR fallback. Bots, slow connections, JS-disabled visitors see only "Settle" + the header. The hero CTA "Open product preview →" (`apps/web/app/page.tsx:195`) lands here.
- **Fix:** add `loading.tsx` skeletons + a server component fallback that fetches the first 10 rows. Or pre-render a snapshot.

### F-C3. `/docs` is empty but linked from four prominent CTAs
- File: `apps/web/app/page.tsx:103, 117, 724, 919` all link `/docs`
- Live URL renders just the brand string. Four "Read the docs" CTAs pointing at nothing.
- **Fix:** populate the page with what's already in `apps/web/app/docs/page.tsx` (it has content, but isn't being rendered correctly), OR temporarily route the links to `https://github.com/Pratiikpy/Settle#readme`.

### D-C1. `pip install settle-sdk` does not exist
- File: `apps/web/app/docs/page.tsx:108`
- Real PyPI package is `settle-protocol-sdk` (`packages/python-sdk/pyproject.toml:2`). Anyone copy-pasting from /docs gets `ERROR: No matching distribution found`.
- Same bug for Rust at `:111`: `settle-sdk = "0.1"` should be `settle-protocol-sdk = "0.1"`.

### D-C2. Embed snippet points at someone else's domain
- File: `apps/web/app/docs/page.tsx:337`
- Code block: `<script src="https://settle.app/pay.js"></script>` and `:379` `createGraphqlClient("https://settle.app/api/graphql")`. Production domain is `use-settle.vercel.app`. `settle.app` is owned by another party. A developer following docs injects a third-party script onto their site.
- **Fix:** find/replace `settle.app` → `use-settle.vercel.app` in `apps/web/app/docs/page.tsx`.

### D-C3. "GitHub ↗" button on /docs links to a non-existent repo
- File: `apps/web/app/docs/page.tsx:440`
- Hardcoded `https://github.com/settle-protocol/settle`. Real repo is `https://github.com/Pratiikpy/Settle`. The button 404s.

### D-C4. Numbers in README contradict each other
- "**15 instructions on the main program**" (`README.md:21`)
- "Instruction list (14)" (`README.md:277`)
- "All 13 program instructions" (`apps/web/app/docs/page.tsx:193`)
- "13 instructions" (`apps/web/app/docs/page.tsx:427`)
- Truth: 15. Same problem with hash counts (4 vs 5), test counts (199 vs 150+ vs 246), driver counts (11 vs 12).
- **Fix:** pick one number per metric (15 ix, 4-on-chain hashes, 12 drivers, [actual] tests) and find/replace.

### B-C1. `/admin/health` URL exposed in `/docs` page tells users to bookmark the broken admin page
- (Same root cause as F-C1 + leaks the URL via copy.)

### S-C1. Auth nonce replay bypass when Upstash is unconfigured
- File: `apps/web/lib/wallet-auth.ts:70-75`
- `verifyWalletSignature` skips nonce uniqueness when `UPSTASH_REDIS_REST_URL` is not set (`setRes === null` → check not enforced). Every route protected by `authFromRequest` / `requireOwnerAuth` degrades to a signature-replay vulnerability if Upstash ever goes down or env vars get misconfigured.
- **Fix:** when Upstash is unreachable, fail closed (`return { ok: false, reason: "replay_check_unavailable" }`), not open.

### S-C2. `/api/crosschain/sign` ships unauthenticated
- File: `apps/web/app/api/crosschain/sign/route.ts:49`
- Stub endpoint with no `authFromRequest`, no bearer token. Anyone can poll arbitrary `approval_pda` addresses, probing on-chain state and extracting `signature_hex`. Even as a stub this sets a precedent.
- **Fix:** add `requireDeployerAuth` (same pattern as `/api/admin/seed-demo-merchants`) until Phase C ships.

### DB-C1. Webhook signing secrets readable by anonymous PostgREST clients
- File: `infra/supabase/migrations/0042_merchant_webhooks.sql` adds `webhook_signing_secret text` to `verified_merchants`
- The `vm_public_read` RLS policy (`0001_init.sql:237`) is `for select using (true)` — applies to all columns. Anyone calling Supabase PostgREST directly can `SELECT webhook_signing_secret FROM verified_merchants`.
- **Fix:** replace `vm_public_read` with column-level grants (only `merchant_pubkey`, `domain`, `display_name`, `verified_at`), OR hash the secret before storage and verify with constant-time compare.

---

## HIGH — fix in week 1

### F-H1. Hardcoded fake merchant pubkeys ship in three onboarding flows
- Files: `apps/web/app/onboarding/page.tsx:105-107`, `apps/web/app/cards/new/page.tsx:69-71`, `apps/web/app/agents/new/page.tsx:34-36`
- Fallback strings like `Arxv1111111111111111111111111111111111111a` are not 32 valid base58 bytes. If `NEXT_PUBLIC_MERCHANT_*` env vars aren't set, onboarding 500s on the first ix build.
- **Fix:** replace the 3 hardcoded strings with the real seeded merchant pubkeys (`5xyG5Pp…`, `ARyNYt1…`, `2MWU5oG…`) OR detect missing env at page load and show "configure your merchants first" rather than crashing.

### F-H2. "Receipts" link in landing nav points at the leaderboard
- File: `apps/web/app/page.tsx:109-115` — `<Link href="/leaderboard">Receipts</Link>`
- Mislabeled. Leaderboard is not the receipts feed.
- **Fix:** rename label to "Network" or change href to `/feed`.

### F-H3. Em-dash overload + parallel triplets across landing + README
- README has **51 em-dashes**. Hero alone uses 3 in 2 sentences. Lines like `apps/web/app/page.tsx:217-237` "Public proof. · Private memos. · Human control." are AI-fingerprint triplets.
- Specific examples flagged in docs audit. The user's stated tonal rule bans this.
- **Fix:** copy editor pass on `README.md` and `apps/web/app/page.tsx`. Replace em-dashes with periods or commas. Break parallel-triplet bullet lists into prose.

### F-H4. Receipt page uses "—" for missing data with no semantic
- File: `apps/web/app/r/[id]/page.tsx` (and component renderers)
- "POLICY VERSION: —" — user can't tell whether `—` means "loading", "not applicable", or "broken".
- **Fix:** different placeholder per case. Use "—" only for "not applicable", show a skeleton for loading, show "unavailable" for fetch error.

### B-H1. `/api/agents/credential` issues bearer credentials with no HTTP auth
- File: `apps/web/app/api/agents/credential/route.ts:56-160`
- Anyone who knows a `card_pubkey` can request a credential. Client-signed mode is OK (Ed25519 check), but server-signed (sandbox) mode has no HTTP auth; only the facilitator-key-must-equal-authority guard, which is fragile.
- **Fix:** add `requireOwnerAuth(req, body.card_authority_pubkey)` before issuing a credential.

### B-H2. `/api/voice/transcribe` is unauthenticated, unrate-limited, drains paid quota
- File: `apps/web/app/api/voice/transcribe/route.ts:45`
- 10 MB body accepted. Anyone can drain `NVIDIA_API_KEY` quota.
- **Fix:** require wallet sig OR Upstash IP rate limit (10/min) like `/api/sandbox/airdrop`.

### B-H3. `sas.ts` returns `verified: true` when env unset (permissive default)
- File: `apps/web/lib/sas.ts:126-128`
- Returns `{ verified: true, source: "trusted_db" }` when SAS env vars are missing. Proxy handles it correctly today but it's a footgun for any future caller that doesn't do the downstream Supabase lookup.
- **Fix:** return `{ verified: false, source: "unconfigured" }` and let the caller decide.

### DB-H1. N+1 in `/api/receipts/[requestId]/route.ts`
- Lines 95-115: each receipt with a `pact_pubkey` triggers two extra sequential queries (pact + card-for-authority).
- **Fix:** single joined query.

### DB-H2. `/api/dashboard` fetches up to 5,000 rows to compute a histogram
- File: `apps/web/app/api/dashboard/route.ts:161-168`
- The `receipts_kind_idx` index already exists. Move aggregation to SQL (`GROUP BY receipt_kind`).

### A-H1. `pact.usdc_mint` is not transitively pinned to `card.usdc_mint`
- File: `programs/settle-agent-card/src/instructions/spend_via_pact.rs:73`, `claim_streaming.rs:63`
- Currently safe because `open_pact` pins it correctly, but no defense-in-depth constraint ties `pact.usdc_mint` to `card.usdc_mint` at spend time. A future ix that mutates pact state without re-pinning would break the daily-cap denomination.
- **Fix:** add `constraint = pact.usdc_mint == card.usdc_mint` to the pact account in spend instructions.

### A-H2. Streaming-rate overflow can lock a pact
- File: `programs/settle-agent-card/src/instructions/claim_streaming.rs:150-152`
- `billable_slots.checked_mul(rate).ok_or(PactOverCap)?` — if a pact accrues `2^64/rate` slots before first claim (agent offline a year, large rate), the multiplication overflows. Funds recoverable via `close_pact`, so HIGH not CRITICAL.
- **Fix:** clamp `billable_slots` to `remaining_budget / rate.max(1)` before multiplying.

---

## MEDIUM — polish before paid customers

### F-M1. Two coexisting design systems
- `apps/web/app/page.tsx` uses inline `style={...}` with hex literals (`#52525b`, `#e4e4e7`).
- `apps/web/app/onboarding/page.tsx` uses Tailwind classes.
- No design token discipline.
- **Fix:** one-pass migration of inline styles to either Tailwind classes or `var(--w6-*)` tokens.

### F-M2. Devnet banner is dismissable + not persisted
- File: `apps/web/components/w6-app-shell.tsx:84` — `useState(false)`
- Dismissing loses persistence on reload. For a payments product on devnet this should be sticky.
- **Fix:** make non-dismissable until mainnet. Or persist dismissal in localStorage for 24h max.

### F-M3. Onboarding amber-on-amber contrast fails WCAG
- File: `apps/web/app/onboarding/page.tsx:314, 317, 320`
- `text-amber-300` on `bg-amber-400/[0.05]` is unreadable in light mode.

### F-M4. Five components return bare `null` instead of disabled state
- `apps/web/components/`: `watch-agent-demo.tsx`, `w6-wallet-button.tsx`, `w6-sidebar.tsx`, `w6-bottom-tab.tsx`, `w6-app-shell.tsx`, plus `capability-heatmap.tsx`, `command-palette.tsx`, `connected-redirect.tsx`, `handle-pay-cta.tsx`, `header.tsx`, `live-presence.tsx`, `receipt-timeline.tsx`, `reputation-badges.tsx`, `w6-icons.tsx`.
- Wallet button rendering null when adapter isn't ready means a missing button with zero feedback.
- **Fix:** render a disabled placeholder.

### F-M5. Toasts leak engineer voice
- `apps/web/app/onboarding/page.tsx:161` — "Save as `SETTLE_AGENT_PRIVKEY`"
- `apps/web/app/agents/new/page.tsx:105` — "Spending rule active. Watch the agent work."
- **Fix:** rewrite toasts as user-facing copy; never expose env var names.

### F-M6. Fake testimonial-style quotes in `TrustLayer`
- File: `apps/web/app/page.tsx:806-814`
- Marketing-shaped quotes attributed to internal labels (`Pact · DeliveryEscrow`) read as fabricated. Either render real receipt strings or remove the section.

### B-M1. `/api/admin/cron/recent` and `/api/admin/federation/origins` fall back to `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Files: `apps/web/app/api/admin/cron/recent/route.ts:25`, `apps/web/app/api/admin/federation/origins/route.ts:50`
- Admin operations on anon key silently return partial data instead of returning 503.
- **Fix:** return 503 explicitly when service-role key is absent.

### B-M2. `/api/x402/proxy/[merchant]` leaks raw error messages
- File: `apps/web/app/api/x402/proxy/[merchant]/route.ts:826-834`
- `spend_ix_failed` returns `(e as Error).message` verbatim — may include Anchor codes, account pubkeys, RPC URLs.
- **Fix:** sanitize before returning. Map known error patterns to safe codes; log raw to server only.

### B-M3. Helius-sender race uses `verifySignatures: false`
- File: `apps/web/lib/helius-sender.ts:106`
- Tx serialized with both signature checks disabled before being sent to two paths concurrently. Not externally exploitable but a correctness footgun.
- **Fix:** enable `verifySignatures: true` for the RPC path; the Sender path is already validated by the Sender service.

### B-M4. `/api/cron/phase5-signer/route.ts:202, 982, 1033` uses literal stub strings as `purpose_text` and `card_pubkey` placeholders for kernel commits
- These ARE flagged as stubs in comments, but the resulting kernel hashes are still committed to chain. Not wrong but worth a hard cap on what counts as "no purpose stated" in the public surface.

### DB-M1. `idempotency_keys` and `nonce_cache` tables grow unbounded
- Files: `0026_idempotency_keys.sql`, `0001_init.sql:154`
- TTL columns exist but no purge cron or trigger. Index will bloat. Confirmed: zero callers query `idempotency_keys` (so it's also unused — see DB-M2 below).
- **Fix:** add a daily cron that `DELETE FROM idempotency_keys WHERE expires_at < now()` and same for `nonce_cache`. Or use Supabase's `pg_cron`.

### DB-M2. Dead tables still in schema (defined, never queried)
- `idempotency_keys` (0026) — never read or written from any API route. Migration says "TODO: cron purge" — purge never wired up either.
- `phase` table — never queried.
- `policy_decisions` (0001) — never queried in `apps/web/app/api/**`. May be written by indexer; verify.
- **Fix:** either remove the migrations or wire up the consumers.

### DB-M3. `user_group_ids()` SECURITY DEFINER granted to `anon`
- File: `0049_fix_group_rls_recursion.sql`
- Anonymous user can call this function and observe membership timing oracles.
- **Fix:** revoke `anon` grant, leave only `authenticated`.

### DB-M4. Views over `receipts` are not security-barrier views
- File: `0001_init.sql:168-189` — `agent_receipts`, `merchant_receipts` plain views
- Default `security_invoker = false` means views run as definer (postgres superuser), bypassing RLS on `receipts`.
- **Fix:** add `WITH (security_invoker = true)` or reroute through SECURITY INVOKER functions.

### A-M1. `pause_streaming` / `resume_streaming` don't check `expiry_slot`
- Files: `programs/settle-agent-card/src/instructions/pause_streaming.rs:25-53`, `resume_streaming.rs:24-55`
- Expired pact can still be paused/resumed. Breaks "expiry is terminal" invariant.
- **Fix:** add `require!(now_slot < pact.expiry_slot, PactExpired)`.

### A-M2. `record_receipt` is permissionless and unmetered
- File: `programs/settle-agent-card/src/instructions/record_receipt.rs:43-64`
- Spammers can bloat indexer ingestion. Mitigations exist off-chain.
- **Fix:** per-attestor cooldown via PDA, or small SOL burn.

### D-M1. Naming drift across docs
- `AgentCard` / `agent-card` / `agent_card` / `card` used interchangeably across `README.md:5, :76, :210`, `SECURITY.md:18`, `PRODUCT_SPEC.md:39`.
- **Fix:** style guide. `AgentCard` for product noun; `settle-agent-card` for program name; `agent_card` only when quoting field names.

### D-M2. Internal-voiced docs at root level
- `SETUP.md` opens "actions you (the human) need to take" / "I (the agent)" — first-person AI-author voice.
- `OPERATOR_HANDOFF.md`, `SESSION_REPORT.md` similarly internal.
- **Fix:** move to `docs/internal/` so they don't appear at the same nav level as PROOF.md.

---

## LOW — fold into normal sprint work

### F-L1. Footer "© 2026 Settle Labs" implies a non-existent legal entity
- File: `apps/web/app/page.tsx:917`
- **Fix:** "© 2026 Settle contributors" until incorporation.

### F-L2. Wallet preview uses `slice(0, 6)` — looks like an unfinished string
- File: `apps/web/app/onboarding/page.tsx:417`
- Renders `@B4cArR` — looks broken.
- **Fix:** truncate as `B4cArR…to2Cp` (head + tail with ellipsis).

### F-L3. No focus-visible rings on landing buttons
- File: `apps/web/app/page.tsx`
- Zero `focus:` rules. Keyboard users can't see where they are.

### F-L4. No breadcrumbs on deep pages
- `/cards/[id]`, `/m/[handle]/disputes`, `/agents/templates/[slug]`, `/admin/federation/origins`

### F-L5. `/blink/research` unit inconsistency
- Lists "$0.50–$2 max" while `/cards/new` uses "$25.00" and `/agents/new` "0.50" with no symbol.

### B-L1. Waitlist endpoint uses in-memory rate limiting
- File: `apps/web/app/api/waitlist/route.ts:27`
- Per-process Map. On Vercel each cold start gets a fresh counter. Real protection nil.

### DB-L1. `domain_verification_tokens` missing INSERT policy comment
- File: `0044_domain_verification_tokens.sql`
- Service-role-only inserts is intentional. Comment to prevent future devs adding an anon insert path.

### DB-L2. `double precision` for trust + fraud scores
- Files: `0021_trust_scores.sql:27`, `0028_autorefill_and_fraud.sql:60`
- `numeric` is safer for cross-runtime portability. Low risk for non-money metrics.

### DB-L3. `capability_leaderboard` is an unindexed live view
- File: `0014_capability_leaderboard.sql`
- Aggregates all ALLOW + public_feed receipts. Composite partial index helps but won't scale.
- **Fix:** convert to `MATERIALIZED VIEW` + periodic refresh.

### A-L1. `create_card` allows `expiry_slot = 0` or any past slot
- File: `programs/settle-agent-card/src/instructions/create_card.rs:37-65`
- Card created already-expired wastes rent; cannot lose funds.
- **Fix:** `require!(params.expiry_slot > clock.slot, CardExpired)`.

### A-L2. `revoke` emits event even when no state changed
- File: `programs/settle-agent-card/src/instructions/revoke.rs:21-54`
- Idempotent by design but indexer sees duplicate events.

### A-L3-L7. Various Anchor doc + edge-case nits
- `release_delivery_escrow.rs:34-39` doc comment mismatch
- `MAX_PACT_ALLOWLIST = 5` / `MAX_ALLOWLIST = 10` hardcoded
- `close_pact.rs:92-95` "OneShot pact" error message misleads Streaming callers
- No `set_compute_unit_limit` on any ix (relies on default 200k CU)
- `release_delivery_escrow.rs:55-56` allows non-ATA accounts (intentional but undocumented)

### D-L1. `BUILD_ORDER.md:187, 196, 205` ships three `(Detail TBD)` sections publicly
### D-L2. `IKA-INTEGRATION.md:124` placeholder still placeholder
### D-L3. README "How Settle compares" table — fake comp matrix where everyone except Settle is `—`. Looks dishonest.

---

## Missing docs a launchable product has

(Synthesized from docs audit.)

- **CHANGELOG.md** — none. Internal `docs/audit/PLAN_DEVNET_BACKLOG.md`-style notes only.
- **CONTRIBUTING.md at root** — README has 2 sentences (`:394-396`).
- **CODE_OF_CONDUCT.md** — none.
- **GOVERNANCE.md / public roadmap** — `docs/STRATEGY.md` is internal-voiced.
- **Status page** — none. README claims "199 tests / 12/12 PASS / live on devnet" but no public status surface. `/api/preflight` is only mentioned in PROOF.md.
- **SUPPORT.md / triage timeline** — security goes to `xprtqk@gmail.com` with no SLO; no Discord, Telegram, or GitHub Discussions.
- **Reference: DenyCode enum, rate limits, auth scheme for `/api/*` writes, idempotency-key contract** — `/docs` page is half-done.

---

## Half-baked features (explicit STUBs in source)

| File | Line | What it admits |
|---|---|---|
| `apps/web/app/api/crosschain/sign/route.ts` | 16, 44 | "Phase C: this endpoint is a STUB" — returns `501 not_implemented` |
| `apps/web/app/api/cron/phase5-signer/route.ts` | 202 | "deterministic stub so purpose_text_hash is never empty" |
| `apps/web/app/api/cron/phase5-signer/route.ts` | 982 | "use `card_pubkey` as a placeholder for the kernel commit" |
| `apps/web/app/api/cron/phase5-signer/route.ts` | 1033 | "falls back to a stub" |
| `apps/web/app/api/import/solana-pay/route.ts` | 43 | "Rate-limit at 10 imports/min per IP (TODO: not yet wired)" |
| `apps/web/app/api/sp/[merchant]/[slug]/route.ts` | 32 | "TODO add /api/pricelist/[slug]/save" |
| `apps/web/app/api/gift-sends/spawn-pact/route.ts` | 91 | "we put a placeholder allowlist that the user can [edit]" |
| `apps/web/app/api/group-accounts/request-spend/route.ts` | 125 | "placeholder all-1s pubkey" written to chain mid-flow |

---

## Verdicts (per agent)

**Frontend:** *"Hackathon project wearing a launch-day suit. The marketing surface rivals YC-batch fintech polish. The moment a user clicks past the hero, the product collapses."*

**Docs:** *"Hackathon README pumped through three 'make it sound more professional' rewrites until the prose got the disease the user is trying to avoid: marketing-shaped, em-dash-glued, parallel-triplet sentences while the numbers underneath disagree."*

**Anchor:** *"Safe for devnet demo and a managed mainnet beta with caps. None of the findings are funds-loss; they are defense-in-depth and DoS hardening. Do not ship mainnet without addressing H1, H2, and ideally a third-party formal audit."*

**Security:** *"Not safe to expose to the public internet today without addressing findings 1, 3, 4. The architecture is sound; the vulnerabilities are edge cases and missing layers, not fundamental design flaws."*

**Database:** *"Solidly above hackathon-grade in intent. RLS enabled everywhere, idempotent migrations. Three issues block production for a financial product: plaintext webhook secrets readable by authenticated PostgREST, dashboard fetches 5K rows for a histogram, anon-key fallback in 30+ routes is a misconfiguration trap."*

**Frontend overall:** "Two-to-three weeks of focused product polish — not a pre-launch audit issue, a 'do not launch' issue."

---

## What to fix this week (recommended priority order)

1. **D-C1 / D-C2 / D-C3** — search-and-replace in `apps/web/app/docs/page.tsx`. 15 minutes. Stops anyone who tries the install instructions from getting an error.
2. **F-C1** — gate `/admin/health` behind `CRON_SECRET` query param. 30 minutes.
3. **D-C4** — pin one number per metric (instructions / hashes / drivers / tests). One pass through README + /docs. 1 hour.
4. **S-C1** — `wallet-auth.ts` fail-closed on Upstash unavailability. 15 minutes.
5. **DB-C1** — column-level grant or hash the webhook signing secret. 30 minutes plus a migration.
6. **F-C2 / F-C3** — populate /docs with what's already in `apps/web/app/docs/page.tsx` (it has content; probably an export bug). 1-2 hours.
7. **F-H1** — replace the 3 hardcoded fake merchant pubkeys. 15 minutes.
8. **F-H3** — copy editor pass on README hero + landing copy to kill em-dashes and triplets. 2 hours.
9. **B-H1 / B-H2** — auth on `/api/agents/credential` + `/api/voice/transcribe`. 1 hour each.
10. **A-H1 / A-H2** — Anchor defense-in-depth fixes. Half day each plus a redeploy.

After that, MEDIUM list works as the first production sprint.

---

*Document generated 2026-05-09 from parallel sub-agent audits of `https://use-settle.vercel.app` and `github.com/Pratiikpy/Settle`. Findings are reproducible — every entry has file:line evidence.*
