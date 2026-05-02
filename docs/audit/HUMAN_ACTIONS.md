# HUMAN_ACTIONS.md

Items the AI cannot complete autonomously. Every entry here was challenged against the 8-step "did you try" checklist before being added.

---

## ~~AU-10-001 RLS verification — RESOLVED (2026-05-02)~~

Verified via anon-JWT + service-role count probe. Wrote `scripts/audit/rls-verify.ts` + `scripts/audit/rls-pg-policies.ts` and ran both against the live devnet Supabase project. Results in `docs/audit/RLS_AUDIT_2026-05-02.md`. Net: 0 real privacy leaks (the 3 SR=anon "leaks" are all public-by-design catalogs); 6 tables have RLS confirmed working under load; 4 group_* tables had an infinite-recursion bug in 0046's policies that I fixed via new migration `0049_fix_group_rls_recursion.sql` (SECURITY DEFINER helper to break the recursion). 13 tables had empty data so RLS state is indeterminate-but-configured.

**Operator action: COMPLETED 2026-05-02 12:58.** Migration 0049 applied to live devnet via `scripts/supabase-apply-migrations.mjs`. Re-verified — group_accounts + group_spend_requests now show `RLS filtering — anon sees 0 of 1` (was `err`). Recursion bug eliminated. group_account_members + group_spend_approvals are empty so indeterminate but no longer ERROR.

---

## Required for mainnet rotation (AU-01-006 + MAINNET_MIGRATION)

**What's needed:** human decisions on:
- Which mainnet RPC provider (Helius mainnet API key)
- Mainnet program keypair (rotate from devnet `HU4piq8…`)
- Mainnet Sentry org/project setup
- Mainnet Vercel deployment env
- Mainnet Supabase project (separate from devnet)
- Anchor program audit firm (cantina / sherlock / OtterSec)

**Why AI can't:** these are paid services + business decisions.

**Status:** Genuinely human; deferred to mainnet milestone.

---

## Required for Anchor program audit (AU-03-006 fix path)

**What's needed:** external Anchor program audit (4-8 weeks lead time).

**Why AI can't:** human signs the engagement letter + pays the firm.

**Status:** Genuinely human; deferred to mainnet milestone.

---

## Required for production Sentry DSN (AU-05-002)

**What's needed:** create Sentry org + project + paste DSN into `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` env vars.

**Why AI can't:** Sentry account creation requires email + 2FA + payment method.

**Status:** Genuinely human; one-time setup.

---

## Required for production Vercel cron + env (AU-01-006 + Phase 5 production deploy)

**What's needed:** in Vercel dashboard:
- `SETTLE_RELAYER_PRIVKEY` (production-rotated)
- `SETTLE_RELAYER_LIVE=true`
- `CRON_SECRET` (production-strong)
- `SENTRY_DSN` (production)
- All other env vars from `.env.example`

**Why AI can't:** Vercel dashboard auth + production cron schedule decisions.

**Status:** Genuinely human; one-time setup per environment.

---

## Required for streaming-pact full landing (PROJECT_STATUS deferred)

**What's needed:** open_streaming_pact + claim_streaming end-to-end test. Currently the test harness uses a regular pact; streaming requires its own.

**Why AI can't:** AI-DOABLE — write a streaming-pact harness following the existing pattern. Reclassify as auto-doable.

**Status:** AI-DOABLE on next pass; not human-blocking.

---

## NOT required from human (AI-doable next pass)

These were considered for HUMAN_ACTIONS but rejected per the 8-step checklist:

- ❌ "Need a wallet to test" — burner adapter exists
- ❌ "Need USDC for tests" — `.test-wallet.json` has 17 USDC
- ❌ "Need cron to fire" — curl with `CRON_SECRET`
- ❌ "Need indexer running" — direct Supabase upserts work
- ❌ "Visual regression needs human eye" — Playwright screenshot diff
- ❌ "Mobile needs real device" — 390×844 viewport
- ❌ "RLS verification needs production access" — devnet anon key in env, can be tested on devnet
- ❌ "Restart-resume indexer test" — can spawn 2 indexer processes locally and verify cursor

---

## Summary

**Genuinely human-only:**
1. Mainnet rotation decisions (4 weeks lead time)
2. Anchor program audit firm engagement (4-8 weeks)
3. Sentry org setup (~30 min)
4. Vercel production env (~30 min)

**Total real human time:** ~1 hour of clicking + 4-8 weeks of audit firm wait.

Everything else can be addressed by the AI in subsequent audit / test / fix cycles.

---

## ~~E1 anchor deploy — RESOLVED (2026-05-02 12:55)~~

Deployed via WSL2 Ubuntu 22.04. Solana CLI 3.1.14 + Anchor 0.31.1 (built from source for GLIBC 2.35). `Anchor.toml` Solana version pin removed — was forcing a broken 2.0.21 download due to a WSL `/mnt/c` cross-filesystem symlink issue with the cuda-10.2 perf-libs.

Deploy results:
- **Program ID:** `HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD`
- **Tx signature:** `4BPGX7zbdSWCNZ4iMGRfMsWB7wAtjNEuXTeussQQCCE4t2VgKpA7PKi5EBBuefkFBy9CRr4QdmuyCTdt8GMyyQtz`
- **Slot:** 459525733
- **Data length:** 493,944 bytes (was 451,672 → +42 KB confirms AU-03-006 streaming-claim fix is live)
- **Cost:** 0.297 SOL (4.69 → 4.40 SOL remaining)
- **IDL account:** `6adGCfQNkkS2pCtJmKtfnCR4jDxKDGrrBrS14bAjxd9D` (initialized via `anchor idl init`)

E2 streaming-pact harness is now unblocked.

---

## ~~Earlier E1 entry (kept for context)~~

AI attempted `anchor build` per Stream E1. Result: "Error: program not found" because the Windows host doesn't have `solana-keygen`, `cargo-build-sbf`, or `solana` CLI on PATH. Anchor build chain requires the Solana toolchain.

**Operator action needed:**
1. Install Solana toolchain on this machine OR run on a Linux/WSL host: `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`.
2. Add to PATH: `~/.local/share/solana/install/active_release/bin` (or wherever Solana installed it).
3. From `programs/settle-agent-card/`:
   ```
   anchor build
   anchor deploy --provider.cluster devnet
   ```
4. Verify post-deploy: `anchor idl init -f target/idl/settle_agent_card.json HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD --provider.cluster devnet`
5. Then re-run `pnpm tsx scripts/audit/check-deployer-sol.ts` to confirm the program account size grew (the new .so is ~50% larger after the AU-03-006 fix).

The deploy is ~15 minutes once the toolchain is installed. Deployer wallet has 4.69 SOL — plenty for the upgrade tx.

The AU-03-006 source-level fix is already in `programs/settle-agent-card/programs/settle-agent-card/src/instructions/claim_streaming.rs` (per Cycle 1) — the deploy just pushes that bytecode on-chain.

---

## ~~npm publish — RESOLVED (2026-05-02 13:25)~~

Both published live to npm:
- https://www.npmjs.com/package/create-settle-merchant — public CLI: `npx create-settle-merchant my-shop`
- https://www.npmjs.com/package/@settle-web/web-components — `<settle-pay>` + `<settle-verify>` (renamed from `@settle/web-components` since user owns the `@settle-web` org, not `@settle`)

Used `npm publish --auth-type=web` flow (passkey 2FA via browser prompt) — operator confirmed both succeeded.

---

## ~~/embed/pay route for `<settle-pay>` — RESOLVED (2026-05-02)~~

Built this session at `apps/web/app/embed/pay/page.tsx`. Reads merchant/amount/note/capability query params, runs wallet-connect → /api/send/build → sign → confirm flow, then postMessages `window.parent` with `settle:paid` / `settle:error` / `settle:closed` envelopes that match what `<settle-pay>` listens for. Typecheck + prod build both clean. No operator action required.

---

## ~~PyPI publish — RESOLVED (2026-05-02 13:08)~~

Published to PyPI as **`settle-protocol-sdk` v0.2.0** at https://pypi.org/project/settle-protocol-sdk/0.2.0/. The name `settle-sdk` was rejected as too similar to existing `settle` package; renamed to `settle-protocol-sdk` (distribution name) — Python module name remains `settle_sdk` so imports unchanged.

```bash
pip install settle-protocol-sdk
```

```python
from settle_sdk import verify_receipt, kernel_commit
from settle_sdk.adapters import make_langchain_tool, make_crewai_tool
```

