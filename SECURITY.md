# Security

## Threat model

Settle is a **policy decision point** for AI-agent payments on Solana. It does **NOT** hold custody of user funds — every spend tx is signed by the user's wallet (Phantom or Privy-managed embedded wallet). Settle's role is to:

1. **Verify dual signatures**: envelope `authority_sig` (user's wallet over canonical envelope JSON) + per-request `agent_sig` (agent's separate Ed25519 key over canonical request line)
2. **Decide ALLOW / DENY / REVIEW** against live on-chain state (revoked / expiry / allowlist / capability pin / per_call_max / daily_cap / merchant verified)
3. **Commit tamper-evident receipts**: 3× BLAKE3 hashes on-chain via `PolicyDecisionEvent` + binding off-chain `purpose_hash` recomputable via `@settle/sdk`

---

## Sealevel attacks audit checklist

Reviewed against patterns from [`solana-developers/sealevel-attacks`](https://github.com/coral-xyz/sealevel-attacks):

### 1. Missing signer check
- ✅ `spend(ctx, ...)`: `authority: Signer<'info>` with `address = card.authority @ SettleError::UnauthorizedAuthority`
- ✅ `revoke(ctx)`: same signer constraint on the card
- ✅ `record_denial(ctx, ...)`: signer must equal `card.authority` OR `card.agent_pubkey` (both pinned at `create_card`); enforced via Anchor `constraint = (signer.key() == card.authority || signer.key() == card.agent_pubkey) @ SettleError::UnauthorizedAuthority`
- ✅ `open_pact(ctx, ...)`: signer constraint matches `parent_card.authority`
- ✅ `close_pact(ctx)`: signer constraint matches `pact.authority`
- ✅ `create_card(ctx, ...)`: signer is the authority

### 2. Missing owner check
- ✅ All Anchor `Account<'info, AgentCard>` and `Account<'info, Pact>` constraints implicitly verify the account is owned by the Settle program (via discriminator).
- ✅ Token accounts are validated via `token::authority = authority` constraint on `authority_usdc`.

### 3. PDA seed substitution
- ✅ `AgentCard` PDA: seeds = `[b"agent-card", authority.key(), label_hash]`. Bump cached in account at creation, then verified on every subsequent ix via `bump = card.bump`.
- ✅ `Pact` PDA: seeds = `[b"pact", parent_card.key(), scope_label_hash]`. Bump cached + verified the same way.
- ✅ Anchor `seeds = [...]` constraint regenerates the PDA in-handler and rejects mismatch.

### 4. Arithmetic overflow / underflow
- ✅ `checked_add` on `used_today + amount` with explicit `OverCap` error mapping
- ✅ `saturating_sub` on refund math: `cap_lamports.saturating_sub(spent)` — never underflows
- ✅ Cargo.toml: `[profile.release] overflow-checks = true` — overflow panics in production builds (not silent wraps)

### 5. Type cosplay (account confusion)
- ✅ Anchor's 8-byte discriminator on every account type (`AgentCard` vs `Pact`) prevents passing one where the other is expected
- ✅ `record_denial` enforces signer must equal `card.authority` OR `card.agent_pubkey` (both pubkeys are pinned at `create_card` time and immutable). Arbitrary signers cannot pollute the on-chain ledger.

### 6. Closing accounts vs. revival
- ✅ `close_pact` sets `pact.closed = true` rather than closing the account — prevents account-revival attack where a rent-exempt deposit lets someone reuse the address
- ✅ `revoke` sets `card.revoked = true` permanently — is_revoked is checked first in every spend ix

### 7. Re-entrancy / TOCTOU
- ✅ Single atomic `spend` ix: cap check + allowlist check + capability pin + CPI USDC transfer + state mutation all in one instruction. No window where a check passes but state changes mid-flight.
- ✅ Slot-based cap window resets are deterministic (220k slots ≈ 24h) — cannot be exploited by validator clock manipulation

### 8. Validator clock trust
- ✅ Cap math uses `Clock::get()?.slot`, not `unix_timestamp`. Slot is consensus-derived; timestamp is validator-advisory.
- ✅ `created_at` field uses `unix_timestamp` for display only — never used in any policy decision

---

## Off-chain security

### Dual-signature credential verification
**Per-request agent_sig**: signed over canonical `METHOD\nPATH\nsha256(raw_body_bytes)\nts\nnonce`. The body hash is computed over **exact UTF-8 bytes transmitted**, not `JSON.stringify(body)` — the proxy buffers raw body before any JSON parsing.

**Envelope authority_sig**: verified against on-chain `card.authority` (live RPC fetch, **NO CACHE** on `card.revoked`). This means revocation propagates instantly across all facilitator instances.

### Replay protection
**Nonce store**: Upstash global Redis with 5-min TTL. SET-NX ensures atomic uniqueness across multi-instance Vercel deployments. In-process Map deduplication is **explicitly forbidden** in V1.

**Loop detection**: per-card+merchant+amount rolling 60s counter via Upstash INCR + EXPIRE. >3 attempts → deny code 6 (`DuplicateOrLoopDetected`).

### Wallet-signed challenges
Sensitive endpoints (`/api/receipts/[id]/decrypt`, `/api/cards/[id]/privacy`) require:
1. Client GETs `/api/auth/challenge?pubkey=...`
2. Client signs canonical message `Settle Auth\nnonce={n}\nts={ts}\npubkey={pk}` with Phantom `signMessage`
3. Server verifies Ed25519 sig + nonce uniqueness + ±5min ts skew
4. Authorization gate: signed pubkey must match the resource's `card.authority`

### Sealed-box encryption
Off-chain receipt metadata (purpose text, deliverable summaries) is encrypted with **X25519 + XChaCha20-Poly1305** before persistence to Supabase:
- 32-byte ephemeral pubkey + Poly1305 MAC + ciphertext
- Nonce derived deterministically from `sha256(ephemeral_pub || recipient_pub)[..24]`
- Round-trip verified by 13 SDK tests including tampered-MAC + tampered-ephemeral + cross-key rejection

### Webhook signing
Outbound merchant webhooks signed with **HMAC-SHA256** keyed by `SETTLE_WEBHOOK_SIGNING_SECRET`. Constant-time comparison in `@settle/sdk verifyWebhookSignature()` to prevent timing attacks.

---

## Key custody boundary

| Key | Held by | Purpose | Compromise impact |
|---|---|---|---|
| User Solana wallet | User (Phantom/Privy) | Signs every on-chain tx | User's funds at risk — same as any wallet |
| Agent Ed25519 keypair | Agent process | Signs per-request `agent_sig` only | Cannot initiate on-chain spends — needs `card.authority` co-sig. Stealing it lets the attacker burn through the cap until revoke fires. |
| Facilitator authority key (V1 sandbox) | Settle server | Signs `spend` + `record_denial` ixs for sandbox cards | Sandbox cards drained — limited to devnet test funds |
| `SETTLE_SEALED_BOX_PRIVKEY` | Settle server | Decrypts off-chain receipt metadata | Receipt purpose-text + deliverable summaries readable; on-chain hashes still tamper-evident |
| `SETTLE_WEBHOOK_SIGNING_SECRET` | Settle server | HMAC outbound webhook signatures | Attacker could forge webhooks to merchants — limited to no-effect data delivery |
| `SETTLE_TREE_AUTHORITY_KEYPAIR_B58` | Settle server | Mints cNFT receipts | Spurious cNFT mints — limited to receipt-collection pollution |
| `SETTLE_TEST_USDC_MINT_AUTHORITY_KEYPAIR_B58` | Settle server | Mints test-USDC on devnet sandbox only | **Devnet only** — no real value at risk |

**Production (mainnet) hardening**:
- Move agent keypair generation to client (browser IndexedDB) — server never sees it
- Move facilitator-as-card-authority pattern to user-signed envelopes only (`SETTLE_REQUIRE_CLIENT_SIGNED_ENVELOPES=1`)
- Rotate sealed-box keypair quarterly
- Use AWS KMS / HashiCorp Vault for the 4 server-held secrets (sealed-box, webhook, tree authority, facilitator)

---

## Privacy posture (truthful, no overclaims)

✅ Settle encrypts sensitive receipt metadata off-chain (X25519 + XChaCha20-Poly1305)
✅ Selective disclosure via Ed25519-signed envelopes lets users reveal specific fields to auditors

❌ Settle does NOT hide sender, recipient, or amount on-chain
❌ Settle does NOT use Token-2022 Confidential Transfers (Solana ZK ElGamal disabled)
❌ Settle does NOT use Token-2022 permanent-delegate refunds (canonical USDC mint immutable)

The SPL token transfer's sender pubkey, recipient pubkey, and amount remain visible on-chain in V1. Only off-chain receipt metadata (purpose text, deliverable summaries) is encrypted.

---

## Reporting security issues

Email `xprtqk@gmail.com` with subject `SETTLE SECURITY`.
- For critical vulnerabilities (cap-bypass, agent_sig forgery, fund-drain): include reproduction steps + please give us 30 days before public disclosure.
- For non-critical issues (rate-limit bypass, DoS): same email, faster timeline acceptable.
- Bug bounty program forthcoming on mainnet launch (Immunefi or Sherlock).

---

## Compliance

- **V1**: non-custodial — Settle never holds funds. No money transmitter license needed for the protocol.
- **V2 fiat on-ramp** via Crossmint / MoonPay — they hold the licenses.
- **V3 custodial features** (if introduced): state-by-state MTL or partner with bank-as-a-service.
- **Sanctioned address handling**: USDC is regulated by Circle. We honor Circle Compliance blacklist by default.
- **Data residency (GDPR)**: V2 Supabase Pro tier lets us pin to EU region for EU users.
