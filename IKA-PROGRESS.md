# IKA-PROGRESS.md — sidetrack build log

Per-phase log of the Settle x Ika sidetrack build. Mirrors the `polish.md`
pattern. Every phase entry documents what was attempted, what was verified,
and what is still pending. No retroactive edits to closed phases.

The plan: [`SIDETRACK-IKA-PLAN.md`](./SIDETRACK-IKA-PLAN.md).
The integration story: [`docs/IKA-INTEGRATION.md`](./docs/IKA-INTEGRATION.md).
The test evidence: [`docs/IKA-TEST-REPORT.md`](./docs/IKA-TEST-REPORT.md).

---

## Phase A — Foundations and program skeleton

**Status:** in progress
**Hard cutoff:** end-of-day-1 — Anchor 1.0 program compiles; `cargo check` clean; deployable stub.

### A.1 Created
- `programs-ika/` — new Anchor 1.0 workspace, isolated from `programs/`.
- `programs-ika/Cargo.toml` — workspace root pinning `anchor-lang = "1"` and `ika-dwallet-anchor` via local path to `resources/identity/ika-pre-alpha/...`.
- `programs-ika/Anchor.toml` — placeholder `declare_id` for devnet/localnet; clones the Ika dWallet program for localnet tests.
- `programs-ika/.gitignore` — excludes `target/`, `.anchor/`, generated keys.
- `programs-ika/keys/.gitkeep` — instructions for keypair generation.
- `programs-ika/README.md` — workspace-level README with build/deploy steps.
- `programs-ika/settle-dwallet-router/Cargo.toml` — single program crate.
- `programs-ika/settle-dwallet-router/src/lib.rs` — 6 instructions stubbed with full doc comments and TODO(phase-b) markers; correct account contexts and param types.
- `programs-ika/settle-dwallet-router/src/state.rs` — `CrosschainCard`, `CrosschainAllowlistEntry`, `CrosschainReceipt` with full sizing + comments.
- `programs-ika/settle-dwallet-router/src/errors.rs` — `RouterError` + `CrosschainDenyCode`.
- `programs-ika/settle-dwallet-router/src/events.rs` — `CrosschainPolicyEvent`, `CrosschainSignedOutcomeEvent`, `CrosschainCardRevokedEvent`.
- `infra/supabase/migrations/0051_crosschain_receipts.sql` — additive schema: extends `receipts` with target_*, amount_minor, dwallet_pubkey, signature_scheme, target_tx_hash, explorer_url; adds `crosschain_cards` mirror table + `crosschain_card_allowlist` rows table; RLS enabled with public-select policies.
- `apps/web/lib/ika/index.ts` — module map + re-exports.
- `apps/web/lib/ika/types.ts` — branded CAIP-2/CAIP-10 types, recipient/asset kind tags, `ChainRegistryEntry`.
- `apps/web/lib/ika/chains.ts` — Sepolia day-1 entry only; `getChainOrThrow` validator.
- `apps/web/lib/ika/program-ids.ts` — Ika dWallet id, settle-dwallet-router id, gRPC endpoint, all env-overridable.
- `apps/web/lib/ika/grpc-client.ts` — Phase D placeholder that throws clearly.
- `docs/IKA-INTEGRATION.md` — user-facing technical story for the submission.
- `docs/IKA-TEST-REPORT.md` — test evidence skeleton with PENDING markers; fallback-path rules; submission claim-language rules.

### A.2 Verified
- File structure matches `SIDETRACK-IKA-PLAN.md` v2 §2.
- Existing repo unchanged (no edits to `programs/`, `app/`, existing API routes, existing receipt rendering, or the 577-spec test suite).
- Migration counter advanced to `0051_crosschain_receipts.sql` (Codex flagged the original `0017` as colliding; existing migrations go up through `0050`).
- ASCII-only doc files (no smart quotes, em-dashes, or other glyphs that confused Codex's reader on v1).
- **`cargo check -p settle-dwallet-router` exits 0 (clean).** Local-path dep on `ika-dwallet-anchor` (`resources/identity/ika-pre-alpha/.../program-sdk/anchor`) resolves across workspace boundaries. Anchor 1.0 macros (`#[program]`, `#[account]`, `#[event]`, `#[error_code]`) all compile against the new state, errors, and events.
- Two issues hit and fixed during the check:
  1. `declare_id!` rejected `D1WaLLet...` because base58 alphabet excludes `0`/`O`/`I`/`l`. Replaced with the Ika example placeholder; will be overwritten by `anchor keys sync` after keypair generation.
  2. Borsh 1.x (Anchor 1.0 dep) requires `#[borsh(use_discriminant = true)]` on enums with explicit discriminants. Added to `CrosschainDenyCode`.

### A.3 Pending (requires tools not in this session)
- `anchor build` — produces the BPF `.so` artifact. Needs Solana CLI 2.2+ and Anchor 1.0.
- `solana-keygen new -o keys/dwallet_router-keypair.json --no-bip39-passphrase` + `anchor keys sync` — generates the real program id and patches `declare_id!`.
- `anchor deploy --provider.cluster devnet` — first deploy of the stub. Records the live program id.
- After deploy, copy the program id into `apps/web/lib/ika/program-ids.ts` (or set `NEXT_PUBLIC_SETTLE_DWALLET_ROUTER_PROGRAM_ID`) and `programs-ika/Anchor.toml`.
- Apply migration `0051` to a Supabase dev project and verify the additive columns are NULL-safe against existing receipt rows.

### A.4 Known risks
- Anchor 1.0 may have BPF runtime quirks the existing 0.31 program does not. The skeleton is intentionally minimal so any such issue surfaces on the first build, not after writing 500 lines of logic.
- The `ika-dwallet-anchor` crate inside the local clone uses `anchor-lang = { workspace = true }` which resolves against *its own* workspace metadata. This should work cleanly because cargo treats path dependencies as standalone; but if it does not, fallback is to point at the published git rev instead of the local path.
