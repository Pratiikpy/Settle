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

### A.3 Done in-session (corrected from earlier "blocker" framing)
- Solana toolchain 2.2.16 located at `~/.local/share/solana/install/active_release/bin/`; added to PATH for build/deploy steps.
- Real keypair generated: `programs-ika/keys/dwallet_router-keypair.json`; pubkey `FNpdUSsk9xzrFR1qsDnE17KaAYA95YwGCtiuKbTa7qSK`.
- `declare_id!` in `lib.rs`, `[programs.devnet]` + `[programs.localnet]` in `Anchor.toml`, and `SETTLE_DWALLET_ROUTER_PROGRAM_ID` default in `apps/web/lib/ika/program-ids.ts` patched with the real pubkey.
- Anchor 1.0.0 located at `~/.avm/bin/anchor-1.0.0`; called directly to bypass the avm symlink-permission failure.
- Devnet deployer wallet has 4.22 SOL — sufficient for first deploy.
- Migration `0051_crosschain_receipts.sql` applied to the live Supabase project (`nbufrcbqjwlfrodinniy`) via the Management API. Verified all 9 new columns on `receipts` (target_chain, target_recipient, target_asset, amount_minor, amount_decimals, dwallet_pubkey, signature_scheme, target_tx_hash, explorer_url) plus both new tables (`crosschain_cards`, `crosschain_card_allowlist`).

### A.4 Resolved — built in WSL (Windows toolchain dead-end)

The Windows `cargo-build-sbf 2.2.16` has a real bug: it tries `CreateFile` with `CREATE_NEW` against paths that exist, fails with os error 183, then wipes its own state on retry. Reproduced in non-admin PowerShell, admin PowerShell, and bash with Developer Mode on. Manual platform-tools placement was clobbered each retry. After ~6 attempts confirmed unfixable from the Windows toolchain.

**Switched to WSL Ubuntu 22.04** (already installed, accessible via `wsl --` from this session). Workspace lives on Windows (`/mnt/c/...`); WSL builds against the mounted path with no symlink/permission issues.

WSL bootstrap done in-session:
- `rustup update stable` — picked up rustc 1.95.0 (stable channel).
- `rustup default stable` — was previously pinned to 1.86 which is too old for anchor 1.0 deps (need 1.88+).
- `avm self-update` — 1.0.1 → 1.0.2 (1.0.0 binaries needed GLIBC 2.39 not in Ubuntu 22.04).
- `avm install 1.0.0 --from-source --force` — built anchor 1.0 from source in 3m 34s, avoids the prebuilt-binary glibc issue.
- `cargo-build-sbf` (Solana 3.1.14, platform-tools v1.52, already cached in WSL) — produced `target/deploy/settle_dwallet_router.so` (101480 bytes) in 30.59s.

### A.5 Devnet deploy

```
Program Id:   FNpdUSsk9xzrFR1qsDnE17KaAYA95YwGCtiuKbTa7qSK
Authority:    B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp  (user devnet wallet)
ProgramData:  FytrquRDfWejoWrF3SycnsuWixVn6nopCz4QCqoWbF9P
Slot:         459962428
Data length:  101480 bytes (matches local .so size)
Deploy sig:   4ZDjqZfo1grF2nHMokNKGKeyAzeJfJ3UVPFFHWYGaBoyXZr7ykpeDZtRgf8Pt4LgjtNAnXnHCRa1pE2JzmeigDcY
Deploy cost:  ~0.71 SOL (4.22 → 3.51)
```

The deployed program id matches the `declare_id!` exactly (no patching needed post-deploy).

### A.6 Deferred to Phase B (out of A scope)

- Anchor IDL extraction (`anchor idl build`) requires Anchor's standard `programs/<crate>/` layout; our flatter `programs-ika/settle-dwallet-router/` layout fails with "Not in a program directory". Solving in Phase B by either restructuring to standard layout OR using `anchor idl parse src/lib.rs` for manual extraction.
- 12 on-chain integration tests (Phase B deliverable).
- Update `apps/web/lib/ika/program-ids.ts` is unchanged because the post-deploy id matches the pre-deploy `declare_id!` (which I patched in Phase A).

### A.7 Phase A status: CLOSED

- ✅ Skeleton compiles (`cargo check`)
- ✅ Anchor 1.0 + ika-dwallet-anchor compile together against BPF target
- ✅ `target/deploy/settle_dwallet_router.so` built (101480 bytes)
- ✅ Program deployed to devnet at `FNpdUSsk9xzrFR1qsDnE17KaAYA95YwGCtiuKbTa7qSK`
- ✅ Migration `0051` applied to live Supabase, all 9 columns + 2 tables verified
- ✅ All file artifacts under `programs-ika/`, `apps/web/lib/ika/`, `docs/IKA-INTEGRATION.md`, `docs/IKA-TEST-REPORT.md`
- ✅ Existing 577 Playwright specs untouched

Total session cost: ~0.71 SOL deploy + a few minutes of WSL detour. Phase A done.

### A.4 Known risks
- Anchor 1.0 may have BPF runtime quirks the existing 0.31 program does not. The skeleton is intentionally minimal so any such issue surfaces on the first build, not after writing 500 lines of logic.
- The `ika-dwallet-anchor` crate inside the local clone uses `anchor-lang = { workspace = true }` which resolves against *its own* workspace metadata. This should work cleanly because cargo treats path dependencies as standalone; but if it does not, fallback is to point at the published git rev instead of the local path.
