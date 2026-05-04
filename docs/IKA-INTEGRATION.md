# Settle x Ika integration

> Solana defines the policy. Ika enforces custody and signing across chains.
> Settle shows proof of what was allowed, blocked, signed, and executed.

This document is the user-facing technical story for Settle's submission to
the Encrypt and Ika sidetrack. Test evidence lives in
[`IKA-TEST-REPORT.md`](./IKA-TEST-REPORT.md).

---

## 1. Problem

Today's agent payment rails assume one chain at a time. Stripe assumes USD on
fiat rails. Existing crypto wallets give an agent a credential that is per-chain;
if your agent should be able to spend BTC on Bitcoin and ETH on Ethereum and
SOL on Solana, you give it three credentials and trust three runtimes to
enforce three different policies.

Settle's existing agent-card model already enforces per-call cap, daily cap,
allowlist, capability pin, expiry, and revocation atomically in one Solana
instruction. But the spend leg is a USDC `TransferChecked` on Solana — the
policy and the asset live on the same chain.

We extend that model with [Ika dWallets](https://ika.xyz). The card stays on
Solana. The policy stays on Solana. The signature is produced via
2PC-MPC by the Ika network — and can be a Bitcoin signature, an Ethereum
signature, a Sui signature. **Without Ika, an agent needs separate credentials
per chain. With Ika, one Settle card is one credential, any chain.**

## 2. Architecture

> Three new components. Zero changes to the deployed `settle-agent-card`
> program.

```
+--------------------------------------------------------------------+
|  apps/web (existing Next.js — additive)                            |
|  - new entry: /start/agent-crosschain                              |
|  - new dashboard panel (additive payload field)                    |
|  - new demo: /watch-crosschain                                     |
|  - new receipt branches for receipt_kind=crosschain_spend          |
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
   +--------------------------+
```

## 3. How Ika is used (load-bearing)

### 3.1 dWallet creation (DKG)

A user opens `/start/agent-crosschain`, picks a chain (Sepolia at submission
time), and configures policy. The browser:

1. Submits a DKG request to the Ika gRPC service via `lib/ika/dkg-flow.ts`.
2. Polls until the NOA writes `CommitDWallet` on the Ika program.
3. Reads the resulting `DWallet` account; surfaces the public key.

The on-chain `init_crosschain_card` ix then binds a `CrosschainCard` PDA to
that dWallet. After `attach_dwallet_authority` runs, the dWallet's authority
is our per-card CPI authority PDA — only the router can request signatures.

### 3.2 Sign request (the policy gate — ALLOW path)

When the agent attempts a payment, the off-chain client:

1. Computes the cross-chain transaction bytes (Ethereum tx for the Sepolia
   demo, RLP-encoded via `viem`).
2. `keccak256` of those bytes is the `message_digest`.
3. Calls `request_crosschain_sign` on the router with `message_digest` plus
   the policy snapshot (amount, chain, recipient, asset, capability_hash).

The router validates:

- card not revoked
- now < expiry_slot
- amount <= per_call_max_minor
- (used_today_minor + amount) <= daily_cap_minor (with reset window)
- (chain, recipient) on the allowlist
- capability_hash matches the pinned entry, if pinned

On ALLOW: the router increments `used_today_minor`, CPIs
`ika_dwallet_anchor::approve_message` with the digest, emits
`CrosschainPolicyEvent { decision: Allow, ... }`. Ika produces the signature.
The client broadcasts on Sepolia and calls `record_signed_outcome` with the
resulting `tx_hash`.

### 3.3 DENY path (also load-bearing)

If any policy check fails, the router emits
`CrosschainPolicyEvent { decision: Deny, deny_code, ... }`. **No CPI is made.
No signature is ever produced.** The receipt is sealed on Solana and
`/r/[id]` renders the deny path with the reason code; there is no Etherscan
link because no Sepolia tx ever existed.

This is what proves the gate is real: Settle emits
both ALLOW and DENY receipts on the same on-chain primitive.

## 4. Devnet program ids and endpoints

| Resource | Value |
|---|---|
| Ika dWallet program | `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY` |
| Ika gRPC endpoint | `https://pre-alpha-dev-1.ika.ika-network.net:443` |
| Settle dWallet router | _Phase A placeholder, populated post-deploy_ |
| Settle agent card | `HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD` _(unchanged)_ |
| Solana cluster | devnet (`https://api.devnet.solana.com`) |
| Target chain | Ethereum Sepolia (`eip155:11155111`) |

## 5. Build, deploy, test

### Prerequisites

- Anchor 1.0.0 toolchain (`avm install 1.0.0 && avm use 1.0.0`)
- Solana CLI 2.2+
- A devnet keypair with at least 5 SOL airdropped
- A Sepolia RPC URL (Alchemy, Infura, or PublicNode)

### Build the router

```bash
cd programs-ika
solana-keygen new -o keys/dwallet_router-keypair.json --no-bip39-passphrase
anchor keys sync
cargo check -p settle-dwallet-router
anchor build
anchor deploy --provider.cluster devnet
```

After deploy, copy the deployed program id into:

- `apps/web/lib/ika/program-ids.ts` (or set `NEXT_PUBLIC_SETTLE_DWALLET_ROUTER_PROGRAM_ID`)
- `programs-ika/Anchor.toml` `[programs.devnet]`
- the table in section 4 above

### Apply the database migration

```bash
psql "$SUPABASE_URL" -f infra/supabase/migrations/0051_crosschain_receipts.sql
```

### Run the test matrix

See [`IKA-TEST-REPORT.md`](./IKA-TEST-REPORT.md) for the full evidence package.
Quick summary of what to run:

```bash
# 1. on-chain unit + integration tests (Phase B)
cd programs-ika && anchor test

# 2. SDK canonical-hash tests (Phase C)
pnpm --filter @settle/sdk test -- crosschain

# 3. API contract tests (Phase C)
pnpm --filter web test:api -- crosschain

# 4. Playwright UI specs (Phase F)
pnpm --filter web playwright test e2e/ika-*.spec.ts

# 5. Real devnet roundtrip (manual, gated on env vars)
SEPOLIA_RPC_URL=... pnpm tsx scripts/ika-roundtrip.ts --allow
SEPOLIA_RPC_URL=... pnpm tsx scripts/ika-roundtrip.ts --deny
```

## 6. Pre-alpha caveats (verbatim, do not soften)

> Ika is in pre-alpha on Solana devnet. Signing uses a single mock signer, not
> real distributed MPC. All 11 protocol operations are implemented (DKG, Sign,
> Presign, FutureSign, ReEncryptShare, etc.) across all 4 curves and 7 signature
> schemes, but without real MPC security guarantees. The dWallet keys, trust
> model, and signing protocol are not final; do not rely on any key material
> until mainnet. The Solana program and all on-chain data will be wiped
> periodically and everything will be deleted when the network transitions to
> Ika Alpha 1.

> Settle does not custody your cross-chain assets. Your funds stay on their
> native chain. Your dWallet's private key is split between you and the Ika
> network using 2PC-MPC; neither side alone can sign. When your agent attempts
> a payment, Settle's Solana program evaluates your policy. If the policy
> passes, Settle's program approves the signing request via CPI; Ika produces
> the signature; you broadcast it on the target chain. If the policy fails, no
> signature is ever produced and a deny receipt is sealed on Solana.

## 7. UI surfaces (Phase E)

Five new pages and one dashboard panel ship the cross-chain flow:

| Surface | Purpose |
|---|---|
| `/start/agent-crosschain` | Form-based init for a `CrosschainCard` PDA. v0.4 is bring-your-own-dWallet (BYO): user pastes a pre-DKG'd dWallet pubkey + signing key from Ika reference tooling. Submits `init_crosschain_card` via wallet adapter. |
| `/cards/crosschain/[card_pubkey]` | Card detail. Status pill (ACTIVE/REVOKED), policy version, target chain, all caps, allowlist entries, revoke button (gated on connected authority). |
| `/watch-crosschain` | Static demo. ALLOW + DENY scenarios side by side. 7-step flow narrative each. Trust-boundary footer unmissable. |
| `/r/<request_id>` (chain-aware branch) | When `receipt_kind = 'crosschain_spend'`, renders chain-aware variant: target chain, CAIP-10 recipient, native amount + symbol (ETH/BTC/SOL), Etherscan/explorer link, or "no tx — signature was not produced" for DENY receipts. The 4-hash chain still binds. |
| Dashboard `CrosschainCustodyPanel` | Hidden when no cards. Visible only when wallet has at least one crosschain card. |

Every cross-chain UI surface carries:
- IKA badge (top-right of card or page header)
- Pre-alpha banner ("Ika is in pre-alpha on Solana devnet…")
- Trust-boundary footer ("Settle does not custody your cross-chain assets…")

## 8. Demo video script (90 seconds)

Recommended takes for the submission demo:

| Time | Action | Audio |
|---|---|---|
| 0–10s | `/watch-crosschain` page open. Camera on the headline + IKA badge. | "Settle's agent cards already enforce on-chain spend rules in USDC on Solana. Here's how we extended that to any chain Ika supports." |
| 10–25s | Open `/start/agent-crosschain`. Connect Phantom. Fill the form: 0.005 ETH per call, 0.05 ETH daily, recipient on Sepolia, 24h expiry, BYO dWallet. | "One Settle card. One Solana policy. The dWallet is split between the user and Ika via 2PC-MPC." |
| 25–45s | Click "Hire agent" → wallet signs → confirmation. Navigate to `/cards/crosschain/<pda>`. Show ACTIVE status, all fields populated. | "On chain. Settle's program owns the policy. Ika owns the signing primitive." |
| 45–65s | **ALLOW path.** Trigger an in-cap spend through the agent harness or `scripts/ika-roundtrip.ts --allow`. Show: Solana program approves → Ika produces signature → Sepolia tx broadcasts → receipt at `/r/<id>` shows `Verified ✓` with Etherscan link. | "Policy passes. Ika signs. The Sepolia tx lands. Settle proves it." |
| 65–80s | **DENY path.** Trigger a $200 over-cap spend. Show: Solana program denies → no MessageApproval PDA created → receipt at `/r/<id>` shows `Blocked ✓` with deny reason and "no tx — signature was not produced". | "Policy fails. No signature is ever produced. Same proof, opposite outcome." |
| 80–90s | Cut back to `/watch-crosschain` ALLOW + DENY split panel. Camera on the trust-boundary footer. | "Solana defines the policy. Ika enforces custody. Settle shows the proof." |

Submission claim language must match `docs/IKA-TEST-REPORT.md` §6. Use:
> **Phases A through E shipped. 68 tests across the integration green (15 router + 12 receipt-kernel + 11 validation + 21 EIP-1559 + 9 UI). Live Ika devnet roundtrip verified via `scripts/ika-roundtrip.ts`.**

If the live roundtrip is not verified at submission time, downgrade the claim to:
> **Phases A through E shipped. 68 tests green at the unit/integration layer. The full Sepolia broadcast roundtrip awaits a live Ika gRPC + DKG flow; structural pipeline is verified end-to-end via the dry-run CLI (`scripts/ika-roundtrip.ts --dry-run`).**

---

## 9. What stays unchanged in this integration

- The deployed `settle-agent-card` program (`HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD`).
- All 14 existing on-chain instructions and their IDL.
- Existing `/start/consumer`, `/start/merchant`, `/start/agent`, `/watch`, `/`,
  and existing receipt rendering for non-crosschain receipts.
- The 577 Playwright specs — they continue to pass alongside the new specs we
  add for the cross-chain surfaces.
