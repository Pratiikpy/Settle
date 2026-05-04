# Settle x Ika sidetrack - integration plan v2

> v2 supersedes v1 in full. Codex audit of v1 surfaced 9 substantive issues. v2 addresses each one explicitly. Section 12 lists the v1->v2 deltas so a reviewer can verify the corrections were applied.

**Track:** Encrypt and Ika - Bridgeless Capital Markets (Ika).

**One-line product positioning (Codex framing, accepted):**
> Solana defines the policy. Ika enforces custody and signing across chains. Settle shows proof of what was allowed, blocked, signed, and executed.

**Goal:** ship a load-bearing Ika integration that extends Settle's existing thesis - programmable scoped spend with on-chain policy - from "USDC on Solana only" to "any asset on any chain, with the policy enforced on Solana and the signature only produced when policy passes."

**Non-goal:** Encrypt/FHE. It contradicts Settle's public-receipt UVP and dilutes the pitch. Skipping for this submission.

---

## 0. Honest scope statement

To prevent the v1 self-contradiction:

- **What stays unchanged on chain:** the deployed `settle-agent-card` Anchor 0.31 program (program id `HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD`). No new instructions added to it. No upgrade. The 14 existing instructions and their IDL are not touched. Existing 577 Playwright specs continue to run as today.
- **What does change:** the web app (Next.js), the SDK (`@settle/sdk`), the Supabase schema (one new migration), and the docs. Plus we add a new sibling on-chain program. These are additive surfaces, isolated behind a new entry point. They do not replace existing flows.
- **What is honestly different from the existing product:** the cross-chain card has its own policy state, its own allowlist schema, its own receipt kind, its own dashboard panel, its own demo. It does not pretend to share `AgentCard`'s daily cap or allowlist. See Section 2 for why.

---

## 1. Hard constraints discovered in recon

| Constraint | Source | Implication |
|---|---|---|
| Anchor 0.31.1 (Settle) vs Anchor 1.0.0 (Ika SDK) | Settle Cargo.toml; Ika README | New program must be Anchor 1.0; goes in its own cargo workspace |
| `AgentCard` has mutable cap state (`used_today`, `last_reset_slot`) | state.rs:57-58 | A sibling program cannot honestly enforce shared daily cap; needs its own cap state |
| `AllowlistEntry` is `{ merchant_pubkey: Pubkey, capability_hash: Option<[u8;32]> }` | state.rs:39-42 | Cannot encode EVM 20-byte addresses or BTC scriptpubkeys; needs a new schema |
| `AgentCard` ends with `Vec<AllowlistEntry>` | state.rs:59 | Foreign-account "first N bytes" decoding is unsafe past byte ~136; do not depend on it |
| Receipt kernel kinds and types are Solana/USDC-locked | receipt-kernel.ts:72,87 | New kind required: `crosschain_spend` with CAIP-10 addresses |
| Receipts API selects `sig_solscan, target_method, target_path` | receipts/[requestId]/route.ts:30 | Renderer must branch on `receipt_kind`; API needs new fields |
| Receipt poster + detail page hardcode USDC, Solana, Solscan | r/[id]/page.tsx; receipts/[requestId]/page.tsx | Both pages need chain-aware variants (or new sibling pages) |
| Dashboard payload has no crosschain slot | dashboard/page.tsx:23 | Add a new payload field `crosschain` with its own loading and error path |
| `/watch` is static, Solana-only marketing page | watch/page.tsx | Build separate `/watch-crosschain` first; do not retrofit `/watch` |
| Ika is pre-alpha, mock signer, state will be wiped | Ika README | README and product UI must say so explicitly |
| Ika needs a `GasDeposit` PDA (IKA + SOL balances) | Ika docs/concepts.md | One-time setup tx in our backend; users do not pay IKA fees |
| Ika devnet program id `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY` | Ika README | Hardcode for devnet; env-var override for future networks |

---

## 2. Architecture (three components, all additive)

```
+--------------------------------------------------------------------+
|  apps/web (existing Next.js)                                       |
|  - new entry: /start/agent-crosschain                              |
|  - new dashboard panel (additive payload field)                    |
|  - new demo: /watch-crosschain                                     |
|  - new receipt routes/views for receipt_kind=crosschain_spend      |
|  - new lib/ika/ for gRPC + tx serialisation + chain registry       |
+----------------+--------------------------+------------------------+
                 |                          |
                 v                          v
   +--------------------------+   +-----------------------+
   | settle-dwallet-router    |   | Ika gRPC service      |
   | (NEW Anchor 1.0)         |<--| (DKG + sign)          |
   | - own cap state          |   | (mock signer pre-alpha)|
   | - own allowlist schema   |   +-----------------------+
   | - CPI -> Ika dwallet     |
   +-----------+--------------+
               | CPI approve_message
               v
   +--------------------------+
   | Ika dwallet program      |
   | 87W54kGYFQ1rg...         |
   +--------------------------+

   +--------------------------+
   | settle-agent-card        |
   | DEPLOYED, UNCHANGED      |
   | (no new ix, no upgrade)  |
   +--------------------------+
```

### 2.1 Why the cross-chain card has its own state (not reading `AgentCard`)

Codex correctly flagged that decoding `AgentCard.{used_today, last_reset_slot}` from a sibling program with no ability to write back is dishonest cap accounting. v1 hand-waved this. v2 fixes it by giving the cross-chain card its own state object, fully owned by the new program:

```rust
#[account]
pub struct CrosschainCard {
    pub authority: Pubkey,            // Solana wallet that controls this card
    pub agent_pubkey: Pubkey,         // off-chain agent identity
    pub label_hash: [u8; 32],         // user label, hashed
    pub dwallet: Pubkey,              // the Ika DWallet account this card controls
    pub gas_deposit: Pubkey,          // the GasDeposit PDA (shared)
    pub daily_cap_minor: u128,        // u128 - chain-agnostic minor units (wei, sats, etc.)
    pub per_call_max_minor: u128,
    pub used_today_minor: u128,       // ours, ours alone, no shared accounting
    pub last_reset_slot: u64,
    pub allowlist: Vec<CrosschainAllowlistEntry>,  // see 2.2
    pub expiry_slot: u64,
    pub revoked: bool,
    pub policy_version: u32,
    pub created_at: i64,
    pub bump: u8,
}
```

Trade-off (declared honestly in product UI and README):
> "Your Solana USDC daily cap and your cross-chain daily cap are enforced separately. Each card has its own policy. v0.5 can unify them."

This is clearer to users than a fake unified cap, and avoids load-bearing decoding of foreign account bytes.

### 2.2 Cross-chain allowlist schema (new)

```rust
pub struct CrosschainAllowlistEntry {
    pub chain_namespace: [u8; 16],  // CAIP-2 namespace, ASCII left-padded: "eip155", "bip122", "solana", "sip2"
    pub chain_reference: [u8; 32],  // CAIP-2 reference (e.g. "11155111" for Sepolia, btc genesis hash truncated)
    pub recipient_kind: u8,         // 0 = raw_bytes, 1 = evm_address, 2 = btc_p2wpkh, 3 = solana_pubkey
    pub recipient: [u8; 32],        // padded; 20 bytes for EVM, 20 for BTC P2WPKH, 32 for Solana
    pub asset_kind: u8,             // 0 = native, 1 = erc20, 2 = spl, 3 = ordinal/runes (future)
    pub asset: [u8; 32],            // contract addr for erc20 (zero-padded), mint for spl
    pub capability_hash: [u8; 32],  // optional pin (zero = unset)
}

pub const MAX_CC_ALLOWLIST: usize = 8;
```

This is independent from `settle-agent-card::AllowlistEntry`. We are not pretending the existing schema generalises.

### 2.3 The 6 instructions of `settle-dwallet-router`

| ix | What | Notes |
|---|---|---|
| `init_router_gas_deposit` | One-time per cluster: derive a program-shared `GasDeposit` PDA on the Ika program via CPI; record reference | Shared gas; users do not pay IKA fees |
| `init_crosschain_card` | Authority signs; allocate `CrosschainCard`; bind to a freshly-DKG'd dWallet pubkey | DKG happens off-chain via gRPC, then we attach |
| `attach_dwallet_authority` | CPI `transfer_ownership` on the Ika dWallet so its `authority` becomes our per-card CPI authority PDA | After this point only the router can request signs |
| `request_crosschain_sign` | The policy gate. Validates against `CrosschainCard` policy (cap, allowlist, expiry, revoke). On pass, CPI `approve_message`. Emits `CrosschainPolicyEvent` with full hash chain | Mirrors `spend_via_pact` semantics |
| `record_signed_outcome` | After Ika returns the signature and the user broadcasts the cross-chain tx, this records `target_tx_hash`, `target_block` (where applicable), and seals the receipt | Off-chain caller passes the tx hash; on-chain just stores it |
| `revoke_crosschain_card` | Sets `revoked = true`. Optionally CPIs `transfer_ownership` to a burn-address so the dWallet is permanently frozen | Revoke is final and visible |

Explicit ALLOW path: `request_crosschain_sign` -> ALLOW -> CPI `approve_message` -> Ika produces signature -> user broadcasts -> `record_signed_outcome` -> receipt sealed.

Explicit DENY path: `request_crosschain_sign` -> DENY -> emit `CrosschainPolicyEvent { decision: Deny, deny_code: OverCap | OffAllowlist | Expired | Revoked }` -> NO CPI to Ika. No signature is ever produced. Receipt is sealed with `decision = deny`.

### 2.4 Receipt model (new SDK kind, new DB schema)

New kind in `packages/sdk/src/receipt-kernel.ts`:

```ts
export const ReceiptKind = z.enum([
  // existing
  "x402_spend", "direct_send", "link_send",
  "streaming_claim", "escrow_release", "escrow_dispute", "refund",
  // new
  "crosschain_spend",
]);

const Caip2 = z.string().regex(/^[a-z0-9]{3,8}:[a-zA-Z0-9_-]{1,32}$/, "CAIP-2 chain id");
const Caip10 = z.string().regex(/^[a-z0-9]{3,8}:[a-zA-Z0-9_-]{1,32}:[A-Za-z0-9_:.-]{1,128}$/, "CAIP-10 account");
const MinorAmount = z.string().regex(/^\d+$/, "non-negative decimal minor units");

const CrosschainSpendInputShape = {
  ...BaseInputShape,
  receipt_kind: z.literal("crosschain_spend"),
  target_chain: Caip2,                  // e.g. "eip155:11155111"
  target_recipient: Caip10,             // e.g. "eip155:11155111:0xabc..."
  target_asset: z.union([Caip10, z.literal("native")]),
  amount_minor: MinorAmount,            // chain-native minor units
  amount_decimals: z.number().int().min(0).max(36),
  dwallet_pubkey: z.string(),           // 33-byte secp/ed pubkey hex
  signature_scheme: z.number().int(),
  target_tx_hash: z.string().nullable(), // populated by record_signed_outcome
  explorer_url: z.string().url().nullable(),
};
```

### 2.5 DB migration (one new file)

`infra/supabase/migrations/0017_crosschain_receipts.sql`:

```sql
ALTER TABLE receipts
  ADD COLUMN target_chain text NULL,
  ADD COLUMN target_recipient text NULL,
  ADD COLUMN target_asset text NULL,
  ADD COLUMN amount_minor numeric(40,0) NULL,
  ADD COLUMN amount_decimals smallint NULL,
  ADD COLUMN dwallet_pubkey text NULL,
  ADD COLUMN signature_scheme smallint NULL,
  ADD COLUMN target_tx_hash text NULL,
  ADD COLUMN explorer_url text NULL;

CREATE INDEX receipts_target_chain_idx ON receipts (target_chain) WHERE target_chain IS NOT NULL;

CREATE TABLE crosschain_cards (
  card_pubkey text PRIMARY KEY,
  authority_pubkey text NOT NULL,
  dwallet_pubkey text NOT NULL,
  target_chain text NOT NULL,
  daily_cap_minor numeric(40,0) NOT NULL,
  per_call_max_minor numeric(40,0) NOT NULL,
  used_today_minor numeric(40,0) NOT NULL DEFAULT 0,
  last_reset_slot bigint NOT NULL,
  expiry_slot bigint NULL,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

The receipts API extension is also explicit: add target_*, amount_minor, dwallet_pubkey, signature_scheme to the SELECT list with safe-null defaults. Renderers branch on `receipt_kind`.

---

## 3. Phased build plan (5-6 working days, honest)

Each phase ends with a verifiable checkpoint. No phase blends into the next without that checkpoint passing.

### Phase A. Foundations and program skeleton (Day 1)

Deliverables:
- `programs-ika/` directory at repo root (separate cargo workspace from `programs/`).
- `programs-ika/settle-dwallet-router/` skeleton on Anchor 1.0.
- Compiles. `cargo check --workspace` clean.
- `keys/dwallet_router-keypair.json` generated.
- `lib/ika/` directory created with empty placeholders.
- Schema written to `infra/supabase/migrations/0017_crosschain_receipts.sql`. Migration runs cleanly on a local Supabase.

Checkpoint: program id printed; SQL applied locally.

### Phase B. Program logic (Days 1-2)

Deliverables:
- All 6 instructions implemented.
- Unit tests using `solana-program-test` covering:
  - init flow: card created with right defaults
  - request_crosschain_sign happy path: cap and allowlist pass, CPI invoked
  - request_crosschain_sign DENY paths (separate test per deny_code: OverCap, OffAllowlist, Expired, Revoked)
  - daily cap reset: a sign request after `last_reset_slot + CAP_WINDOW_SLOTS` zeroes `used_today_minor`
  - revoke: post-revoke sign request fails with deny_code Revoked
- Anchor IDL exported.
- Deployed to devnet. Program id recorded.

Checkpoint: 6+ on-chain integration tests passing; devnet deploy successful.

### Phase C. SDK + receipts plumbing (Day 2)

Deliverables:
- New receipt kind in `packages/sdk/src/receipt-kernel.ts` (CrosschainSpendInputShape, canonical hashing).
- SDK unit tests: canonical hash stable across runs; round-trip BCS-style serialise/deserialise.
- DB migration applied to dev Supabase project.
- `apps/web/app/api/receipts/[requestId]/route.ts`: extend SELECT, return chain/asset/amount fields when `receipt_kind = 'crosschain_spend'`.
- New API: `GET /api/crosschain/cards?pubkey=...` returning the crosschain_cards rows for a wallet (powering the dashboard panel).
- New API: `POST /api/crosschain/sign` server route that the UI calls during the sign flow. It posts to Ika gRPC, polls the MessageApproval PDA for status, and returns the signature to the browser.

Checkpoint: receipt API returns crosschain_spend receipts with all new fields; SDK canonical hash test green.

### Phase D. Web glue and gRPC client (Days 2-3)

Deliverables:
- `lib/ika/grpc-client.ts`: typed wrapper around `@connectrpc/connect-web` + protobuf-ts gRPC-Web transport (matching the multisig-react example).
- `lib/ika/dkg-flow.ts`: full DKG roundtrip - submit DKG request, poll for NOA `CommitDWallet`, return the dWallet account pubkey.
- `lib/ika/sign-flow.ts`: keccak256 the cross-chain tx -> CPI request_crosschain_sign -> poll MessageApproval -> fetch signature.
- `lib/ika/chains.ts`: chain registry. Day-1 entry is **Ethereum Sepolia** only. Each entry exports: tx serializer (using viem), broadcast endpoint, explorer URL builder, address validator, denomination metadata.
- `lib/ika/policy-snapshot.ts`: builds the policy snapshot hash exactly the way our SDK does for x402 spends, but with the crosschain field set.

Checkpoint: a CLI script (`scripts/ika-roundtrip.ts`) creates a card, signs an Ethereum Sepolia tx via Ika, broadcasts it, and reports both the Solana receipt and the Sepolia tx hash.

### Phase E. UI surfaces (Days 3-4)

All new UI is isolated behind new entry points. Existing UIs are touched only to add navigation links.

Five new pages and one new dashboard panel:

1. **`/start/agent-crosschain`** - new persona. Steps:
   - connect Solana wallet
   - pick chain (Sepolia only on day 1, with the dropdown wired for future chains)
   - set policy: per-call cap, daily cap, expiry, allowlist (chain + recipient + asset), capability pin
   - "Hire agent" -> DKG runs (visible loading state showing what is happening) -> dWallet pubkey appears -> card active

2. **`/cards/crosschain/[card_pubkey]`** - card detail. Shows: dWallet, chain, balance on target chain, cap remaining today, allowlist, recent receipts (crosschain_spend kind), revoke button.

3. **`/r/[id]` chain-aware variant** - the existing receipt poster already exists; **we add a server-side branch** in `apps/web/app/r/[id]/page.tsx` that, when `receipt_kind === 'crosschain_spend'`, renders a different body: target chain badge, target recipient (chain-formatted), target asset, target amount in chain-native units, target_tx_hash with explorer link, decision and deny code (if any), the same 4-hash chain. The existing USDC/Solana receipt poster stays exactly as-is for the existing kinds.

4. **`/receipts/[requestId]` chain-aware variant** - same pattern as `/r/[id]`. Branch on `receipt_kind`.

5. **`/watch-crosschain`** - dedicated demo page (NOT a tab on `/watch`; Codex correctly flagged that). Mirrors `/watch` styling so it feels familial. Shows two scripted scenarios live, side by side:
   - **ALLOW path:** cap=$50/day, request to spend $5 ETH on Sepolia to allowlisted address. Watch the policy gate pass, watch Ika sign, watch the Sepolia tx land.
   - **DENY path:** same card, request $200 (over per_call_max). Policy gate denies. NO signature is produced. Receipt is sealed with deny.

6. **Dashboard panel: "Cross-chain custody"** - additive. Appears below the existing dashboard cards, ONLY when the user has at least one crosschain_card. Fetched via `GET /api/crosschain/cards?pubkey=...`. Shows: card label, target chain badge, dWallet pubkey (truncated, copy button), cap remaining today, last action, status pill (active / revoked). Click-through to `/cards/crosschain/[pubkey]`.

Visual marker: every crosschain surface gets a small but clear `IKA` badge (top-right of the card or page header) so judges and users see exactly which surfaces use Ika.

Custody copy (verbatim, every cross-chain page footer):
> "Your assets stay on their native chain. Settle never custodies them. Settle's program approves the signature only when policy passes; Ika produces the signature. There is no bridge deposit."

Pre-alpha banner (every cross-chain page top):
> "Ika is in pre-alpha on Solana devnet. Signing uses a single mock signer, not real distributed MPC. Production architecture is unchanged; mainnet launch is upcoming."

Existing pages touched: only `/dashboard` (one new conditional panel, one new payload field) and the global header (one new menu link to `/start/agent-crosschain`).

Pages NOT touched: `/`, `/watch`, `/start`, `/start/consumer`, `/start/merchant`, `/start/agent`, `/m/...`, `/agents`, `/feed`, `/leaderboard`, `/verify`, the existing `/r/[id]` paths for non-crosschain receipts, all admin and merchant management pages.

Checkpoint: all 5 pages render in dev. Dashboard panel hides when no crosschain card exists. Pre-alpha banner present everywhere it should be.

### Phase F. Tests (Days 4-5)

Codex was right: 5 UI specs are not enough. Real test plan:

**On-chain (programs-ika/settle-dwallet-router):**
- 12 integration tests under `programs-ika/settle-dwallet-router/tests/` using `solana-program-test`:
  - 6 happy-path tests (init flow, attach, sign request ALLOW, daily reset, sign with capability pin, revoke)
  - 6 deny tests (OverCap per_call, OverCap daily, OffAllowlist by chain, OffAllowlist by recipient, Expired, Revoked)

**SDK:**
- 5 unit tests for crosschain_spend canonical hashing (vectors saved as JSON fixtures).

**API:**
- 4 integration tests against a local Supabase: receipt with crosschain fields round-trips correctly; cards list endpoint returns expected shape; sign endpoint surfaces gRPC errors usefully; deny receipts have null target_tx_hash.

**E2E (real devnet, scripted - not Playwright):**
- One end-to-end script (`scripts/ika-e2e.ts`) that runs the full flow on devnet against the real Ika gRPC service: create card, sign Sepolia tx via Ika, broadcast, verify the on-chain Solana receipt and the Sepolia receipt match.

**Playwright (UI):**
- 8 specs covering:
  - `/start/agent-crosschain` form validation (3 specs: invalid address, cap zero, expired-too-soon)
  - DKG loading state appears and resolves (1 spec, mocked sign flow)
  - Card detail page loads and shows all fields (1 spec)
  - Revoke button changes status (1 spec)
  - `/watch-crosschain` ALLOW path scripts to completion (1 spec)
  - `/watch-crosschain` DENY path renders the deny banner (1 spec)
- Existing 577 specs MUST continue to pass. We add to them, not replace.

Checkpoint: all categories green. Total spec count goes 577 + 8 = 585 minimum.

### Phase G. README, docs, demo video (Day 5)

Three docs changes, lightweight on the main README per Codex's guidance:

- **Main `README.md`:** add one bullet under "Public surfaces" (`/watch-crosschain` and `/start/agent-crosschain`); add one line under "On-chain" pointing to the new program; add one line referencing `docs/IKA-INTEGRATION.md`. **Do not** rewrite Why Settle, do not change the elevator pitch, do not move cross-chain to the front page.
- **New: `docs/IKA-INTEGRATION.md`:** the heavy lifting goes here. Sections:
  1. Problem (why cross-chain agent custody is hard today)
  2. The architecture in one diagram
  3. How Ika is used (load-bearing description, with the deny path included)
  4. Devnet program ids and gRPC endpoint
  5. Build, deploy, and test instructions
  6. Pre-alpha caveats (verbatim from Ika README + the trust-boundary statement)
- **`docs/PRODUCT_SPEC.md` 7 (Solana primitive inventory):** add Ika dWallets to "On-chain (used today)" with 3 lines.

Demo video, 90 seconds, exact script:
- 0-10s: "Settle's agent cards already enforce on-chain spend rules in USDC. Today we extend that to any chain."
- 10-25s: open `/start/agent-crosschain`. Connect wallet. Set $50/day cap, allowlist `0x...recipient` on Sepolia.
- 25-45s: click "Hire agent." DKG runs - show what's happening - dWallet pubkey appears, card active.
- 45-65s: ALLOW path. Trigger a $5 send. Solana program validates -> CPI to Ika -> signature -> Sepolia tx hash -> receipt poster shows the cross-chain receipt. Etherscan link works.
- 65-80s: DENY path. Trigger a $200 send. Same card. Solana program denies (over per_call_max). No signature is produced. Receipt poster shows DENY with reason.
- 80-90s: "One Settle card. Any chain. The policy is enforced on Solana. The signature only exists when policy passes. That's Ika."

Checkpoint: video recorded, README PR-clean, `docs/IKA-INTEGRATION.md` complete.

### Phase H. Submission (Day 5-6)

- Squash commits where appropriate; preserve a clean history for the new program and new web surfaces.
- Submission form: GitHub link + video link + `docs/IKA-INTEGRATION.md` excerpt + program ids.

---

## 4. Real-user UI test journey (the bar)

A stranger should be able to do this in under 5 minutes. We test it ourselves before submission.

| # | Step | Expected | Verifies |
|---|---|---|---|
| 1 | Open `/start/agent-crosschain` | Page renders, IKA badge visible, pre-alpha banner visible | UI ships, honesty visible |
| 2 | Connect Phantom on devnet | Wallet connected pill | Wallet adapter wired |
| 3 | Pick Sepolia, set per_call=$10, daily=$50, paste valid 0x... recipient, expiry=24h | Form validates, "Hire agent" enables | Form + chain validators |
| 4 | Click "Hire agent" | Loading state explains DKG progress; dWallet appears in <=10s; card status shows Active | DKG roundtrip and write-back |
| 5 | Open `/dashboard` | "Cross-chain custody" panel shows the new card with cap remaining = full | Dashboard payload extended correctly |
| 6 | Click into card | `/cards/crosschain/[pubkey]` loads with all fields populated | Card detail page wired |
| 7 | Click "Test spend $5" (demo button) | Loading -> success -> receipt link | request_crosschain_sign happy path through to broadcast |
| 8 | Open the receipt | `target_chain = eip155:11155111`, target_tx_hash present, Etherscan link works, 4-hash chain shown, decision = ALLOW | Receipt parity for crosschain_spend kind |
| 9 | Try "Test spend $200" | Receipt link -> opens with decision = DENY, deny_code = OverCap, no target_tx_hash, no Etherscan link | Deny path; no signature produced |
| 10 | Click "Revoke" on the card | Card status flips to Revoked, future spend buttons disabled and explain why | Revoke ix end-to-end |
| 11 | Close everything; reopen `/cards/crosschain/[pubkey]` | Status still Revoked, history preserved | State persistence |
| 12 | Run existing flows: send USDC at `/send`, hire a USDC agent at `/start/agent`, view existing receipts | All work as before | Zero regressions in existing surfaces |

If any of these fails on devnet against the real Ika gRPC service, we do not submit until it passes.

---

## 5. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Anchor 1.0 BPF runtime quirks block deploy | Medium | Phase A delivers a deployed skeleton on Day 1; we hit the issue early, not late |
| Ika gRPC service is down during demo | Medium | Pre-record demo on a working day; keep a still-image fallback ready |
| DKG takes longer than 10s in pre-alpha | High | Loading state explains the wait honestly; the wait sells the security story |
| Sepolia RPC rate limits | Low | Alchemy or Infura free tier with key in env var |
| Receipt schema migration causes Supabase production drift | Medium | The migration is additive; all new columns NULL-able with safe defaults; existing receipts unaffected |
| New on-chain program has a bug we ship to devnet | Medium | 12 integration tests + 1 E2E script; mandatory before submission |
| 577 existing Playwright specs regress because of dashboard panel change | Medium | Panel is hidden when no crosschain card exists; new specs added, existing untouched; full suite run pre-submit |
| Time overrun spills into main repo work | Medium | Hard cutoff at end of Day 4: if `/watch-crosschain` ALLOW path doesn't run end-to-end, we ship with a stubbed sign flow that returns a recorded signature; we declare this honestly in the demo |
| Codex finds another set of issues post-build | Low-Medium | Plan v3 in advance; treat audit findings as gates, not opinions |

---

## 6. Decision log (open questions + chosen answers)

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Read `AgentCard` from sibling vs own state | Own state | Foreign account decode is brittle; no way to write back the cap |
| 2 | Unify daily cap with USDC card | No (separate) | Honest with users; simpler; v0.5 can unify |
| 3 | Reuse `AllowlistEntry` | No | Solana-pubkey-shaped; new `CrosschainAllowlistEntry` |
| 4 | Reuse receipt kinds | No | Add `crosschain_spend`; CAIP-10 addresses don't match base58 regex |
| 5 | Modify `/watch` | No | Build new `/watch-crosschain`; fold into `/watch` only post-submission |
| 6 | First chain | Ethereum Sepolia | Easiest tooling, broadest familiarity, free RPCs |
| 7 | Encrypt/FHE in scope | No | Contradicts the public-receipt UVP |
| 8 | Per-card vs per-program CPI authority | Per-card | Smallest blast radius if a card is ever compromised |
| 9 | Per-card vs shared GasDeposit | Shared | Users do not pay IKA fees directly; better UX |
| 10 | Anchor 1.0 sibling vs upgrade existing | Sibling | Existing program is deployed and stable; upgrade risks 14 ix and 577 specs |

---

## 7. What this is NOT (so the pitch stays clean)

- Not a rewrite of the main pitch. Settle is still a Solana payment app.
- Not a hybrid Encrypt+Ika story. One track, well done.
- Not a replacement for `settle-agent-card`. Sibling and additive.
- Not a production-ready cross-chain custody tool. Ika is pre-alpha; we say so.
- Not "another wallet" and not "another bridge." Settle is the policy and audit control layer; Ika is the signing primitive.

---

## 8. Acceptance criteria for submission

A judge reading the README + watching the demo + clicking through `/start/agent-crosschain` should think:

1. *"This is core to the product, not bolted on."* - the new flow uses Settle's existing card / receipt / hash-chain DNA; the IKA badges make it visible.
2. *"This is novel - on-chain policy, off-chain MPC custody, cross-chain execution, public receipts."*
3. *"It actually works."* - end-to-end demo on devnet with a real Sepolia tx hash.
4. *"Both ALLOW and DENY are real."* - the deny path is shown and the receipt proves no signature was produced.
5. *"Trust boundary is clear."* - pre-alpha banner everywhere, custody footer everywhere.
6. *"Mainnet trajectory is obvious."* - real receipt parity, real policy code, real CPI integration; just waiting on Ika alpha 1.

If those six are met, this is competitive in the track without diluting Settle's main identity.

---

## 9. Build order (the actual sequence)

```
Day 1: Phase A       (skeleton, workspace, migration scaffolding)
Day 1-2: Phase B     (program + 12 integration tests)
Day 2: Phase C       (SDK kind + receipts API extension + crosschain APIs)
Day 2-3: Phase D     (gRPC client, DKG flow, sign flow, chain registry)
Day 3-4: Phase E     (5 new UI pages + dashboard panel)
Day 4-5: Phase F     (12 program tests + 5 SDK tests + 4 API tests + 1 E2E + 8 Playwright)
Day 5: Phase G       (README + IKA-INTEGRATION.md + demo video)
Day 5-6: Phase H     (squash, polish, submit)
```

Hard cutoffs:
- End of Day 1: Anchor 1.0 program compiles and deploys to devnet, even if logic is stub.
- End of Day 2: program ALLOW path passes one on-chain test.
- End of Day 3: end-to-end CLI roundtrip works (`scripts/ika-roundtrip.ts`).
- End of Day 4: at least one UI page renders the ALLOW path against real devnet.
- End of Day 5: demo video recorded.

If a hard cutoff slips by more than half a day, switch to the fallback path: stub the gRPC sign call with a recorded signature and a banner that says "demo mode - signature recorded from prior devnet run." The receipts and policy gate remain fully real. Honest framing in the demo.

---

## 10. Things that explicitly will NOT change in this work

So a future audit can verify the scope:

- `programs/settle-agent-card/` - not modified.
- The deployed program id and its IDL - not modified.
- Any of the 14 existing ixs - not invoked, not modified, not tested differently.
- The existing receipt kinds in `@settle/sdk` - extended with one new kind, never re-typed.
- The home page `/`, the existing `/watch`, the existing `/start/*` flows, the existing `/r/[id]` rendering for non-crosschain receipts - all unchanged.
- The existing 577 Playwright specs - all preserved and continue to pass.

Anything else either gets a new file/route or an additive, conditional code path.

---

## 11. Trust boundary statement (to be used verbatim in product UI and docs)

> Settle does not custody your cross-chain assets. Your funds stay on their native chain. Your dWallet's private key is split between you and the Ika network using 2PC-MPC; neither side alone can sign. When your agent attempts a payment, Settle's Solana program evaluates your policy. If the policy passes, Settle's program approves the signing request via CPI; Ika then produces the signature; you broadcast it on the target chain. If the policy fails, no signature is ever produced and a deny receipt is sealed on Solana. Ika is in pre-alpha; signing uses a single mock signer today. Production architecture matches what is shipped.

---

## 12. v1 -> v2 deltas (Codex audit follow-up)

Each row is a Codex finding from v1, with what changed in v2.

| Codex finding (v1) | Resolution in v2 |
|---|---|
| Sibling cannot honestly enforce shared `daily_cap` | Cross-chain card has its own `used_today_minor` and `last_reset_slot`; trade-off declared in product copy and docs (Section 2.1) |
| Existing allowlist cannot encode EVM/BTC/Sui addresses | New `CrosschainAllowlistEntry` schema with chain namespace, recipient kind, asset kind (Section 2.2) |
| Receipt API/UI Solana/USDC-locked | New `crosschain_spend` SDK kind, new DB columns, chain-aware branches in `/r/[id]` and `/receipts/[id]` renderers (Sections 2.4, 2.5, Phase E) |
| "Zero changes to existing Settle code" contradicted | Section 0 declares scope honestly: zero changes to deployed program; web/SDK/docs do change additively |
| Decoding foreign `AgentCard` "first N bytes" is brittle | Removed entirely - cross-chain card has its own state, no foreign decoding (Section 2.1) |
| Receipt kinds and address types Solana-only | New `Caip2`/`Caip10` validators alongside existing `Pubkey` (Section 2.4) |
| Dashboard payload has no slot for crosschain | Additive payload field; new `/api/crosschain/cards` endpoint; conditional panel hides when empty (Phase C, Phase E) |
| `/watch` second tab is wrong move | Built `/watch-crosschain` as a separate page (Phase E item 5) |
| 5 UI specs insufficient | 12 on-chain + 5 SDK + 4 API + 1 E2E + 8 Playwright (Phase F) |
| Encoding mojibake | Verified: file is genuine UTF-8. Codex reader was wrong. v2 written without smart-quote characters anyway to remove ambiguity. |
