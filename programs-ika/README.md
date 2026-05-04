# programs-ika — Settle x Ika sidetrack workspace

Sibling workspace to the main `programs/`. Holds the Anchor 1.0 program(s)
that integrate with the [Ika](https://ika.xyz) dWallet pre-alpha SDK.

This workspace is intentionally isolated from `programs/settle-agent-card`
because the two cannot share an `anchor-lang` major version. Nothing in
`programs/` references anything in here.

| Item | Value |
|---|---|
| Anchor version | 1.0.0 |
| Solana toolchain | 2.2+ |
| Ika devnet program id | `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY` |
| Ika gRPC endpoint | `https://pre-alpha-dev-1.ika.ika-network.net:443` |

## Bootstrap (Phase A)

```bash
# from this directory
solana-keygen new -o keys/dwallet_router-keypair.json --no-bip39-passphrase
anchor keys sync                                                 # patches declare_id! in lib.rs
cargo check -p settle-dwallet-router                             # quick correctness check
anchor build                                                     # produces target/deploy/settle_dwallet_router.so
solana airdrop 5 -u devnet                                       # if your deployer is empty
anchor deploy --provider.cluster devnet                          # records the deployed program id
```

After deploy, copy the deployed program id into:

- `apps/web/lib/ika/program-ids.ts`
- `programs-ika/Anchor.toml` (`[programs.devnet]` section)
- `docs/IKA-INTEGRATION.md`

## Layout

```
programs-ika/
├── Anchor.toml
├── Cargo.toml                       # workspace root (Anchor 1.0)
├── keys/
│   └── dwallet_router-keypair.json  # NOT committed (generated)
└── settle-dwallet-router/
    ├── Cargo.toml
    └── src/
        ├── lib.rs                   # declare_id, instructions
        ├── state.rs                 # CrosschainCard, CrosschainAllowlistEntry, CrosschainReceipt
        ├── errors.rs                # RouterError, CrosschainDenyCode
        └── events.rs                # CrosschainPolicyEvent, ...
```

## What this program does NOT do

- It does not read, write, or share state with `settle-agent-card` (the deployed
  program at `HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD`).
- It does not pretend the existing `AgentCard` allowlist generalises to EVM/BTC
  recipients.
- It does not unify daily-cap accounting with the USDC card. Each card has its
  own cap. The product UI declares this honestly.

See the parent repo's `SIDETRACK-IKA-PLAN.md` for the full plan and `docs/IKA-INTEGRATION.md`
for the user-facing integration story.
