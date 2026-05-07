# Bug #26 — spend_via_pact stack overflow — REDEPLOY LOG

## Symptom (pre-fix)
Every production `scheduled_send` cron execution since 2026-05-03 was failing with:
```
live spend_via_pact failed: Simulation failed.
Message: Transaction simulation failed: Error processing Instruction 0:
Program failed to complete.
Logs:
  Program HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD invoke [1]
  Program log: Instruction: SpendViaPact
  ...
```
Visible inline on `/admin/health` after the Bug #51 diagnostic patch (commit 270944f).

## Source-side fix
Commit `89ab171` boxed five large accounts in `SpendViaPact` to move them off the
4 KB BPF stack:
- `card: Box<Account<'info, AgentCard>>`
- `pact: Box<Account<'info, Pact>>`
- `usdc_mint: Box<Account<'info, Mint>>`
- `vault_usdc: Box<Account<'info, TokenAccount>>`
- `merchant_usdc: Box<Account<'info, TokenAccount>>`

Confirmed in `programs/settle-agent-card/programs/settle-agent-card/src/instructions/spend_via_pact.rs:54-86`.

## On-chain redeploy (2026-05-07)

**Tools installed in WSL Ubuntu-22.04:**
- Solana CLI 1.18.26 (via `release.anza.xyz/v1.18.26/install`)
- Rust 1.95.0 (via rustup)

**Authority + funding:**
- `~/.config/solana/id.json` → `B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp`
- Same wallet as the program's on-chain upgrade authority
- Pre-deploy balance: 7.65 SOL (sufficient for upgrade)

**Build artifact deployed:**
- `programs/settle-agent-card/target/deploy/settle_agent_card.so` (494,192 bytes)
- Built 2026-05-06 23:06 — well after the 89ab171 fix commit
- Source-verified to contain the 5 boxed accounts

**Deploy command (after first attempt failed with TPU websocket handshake error):**
```
solana program deploy --use-rpc \
  --program-id HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD \
  --keypair /mnt/c/Users/prate/.config/solana/id.json \
  --url https://api.devnet.solana.com \
  /mnt/.../target/deploy/settle_agent_card.so
```

**Post-deploy on-chain state:**
```
Program Id: HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD
Authority:  B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp
Last Deployed In Slot: 460677446    ← was 460533542 (≈16h older)
Data Length: 496856 bytes
```

## Verification (next step)
Watch `/admin/health` over the next phase5-signer cron cycles. Pre-fix all
recent `scheduled_send` rows were `failed` with "Program failed to complete".
Post-fix the next batch should land as `confirmed` with valid signatures.
