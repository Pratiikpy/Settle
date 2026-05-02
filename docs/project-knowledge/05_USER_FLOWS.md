# User Flows

## Flow 1: First-Time User

1. User lands on `/`.
2. User connects wallet.
3. User claims handle via onboarding/settings.
4. User sees dashboard.
5. User sends first payment or creates first AgentCard.
6. User opens receipt page.
7. User verifies receipt or shares it.

Audit checks:

- Can this be completed on devnet with no hidden manual step?
- Are missing SOL/USDC states understandable?
- Does each screen have a next action?

## Flow 2: Send Money To A Handle

1. User opens `/send` or `/at/[handle]`.
2. App resolves handle.
3. App builds transaction.
4. Wallet signs.
5. Payment confirms.
6. Receipt page opens.

Audit checks:

- Does the route produce a canonical receipt?
- Is non-USDC Jupiter path disabled or clearly mainnet-only on devnet?
- Is failure copy plain English?

## Flow 3: Agent Spend

1. Human creates AgentCard.
2. Human opens/funds Pact.
3. Agent signs spend through x402 proxy.
4. Proxy enforces policy.
5. On-chain program transfers from vault.
6. Receipt appears.
7. User can revoke/close.

Audit checks:

- Authority and agent keys are separate.
- Caps and allowlists are enforced on-chain.
- Denials are recorded consistently.
- Revocation blocks future spend.

## Flow 4: Streaming Pact

1. Authority opens streaming pact.
2. Vault funded with max total.
3. Agent claims accrued entitlement.
4. Authority can pause/resume/close.
5. Claims appear in receipts/activity.

Audit checks:

- Claim amount formula matches code and docs.
- Daily cap composes across pacts.
- Receipt creation is universal, not flow-specific.

## Flow 5: Delivery Escrow

1. Buyer opens escrow.
2. Funds held in vault.
3. Buyer releases, disputes, or timeout release occurs.
4. Receipt state updates.

Audit checks:

- Merchant is pinned.
- Deadline rules are enforced.
- Dispute and release cannot redirect funds.
- UI shows exact state.

## Flow 6: Merchant/Creator

1. Merchant/creator claims handle.
2. Creates price/link/QR.
3. Buyer pays.
4. Merchant sees analytics, receipts, disputes, webhooks.

Audit checks:

- Public/private receipt settings are respected.
- Webhooks are signed/retryable.
- Merchant page does not claim unsupported features.

## Flow 7: Developer Integration

1. Developer reads `/docs`.
2. Uses SDK/MCP/web component.
3. Builds/receives a receipt.
4. Verifies receipt.

Audit checks:

- Docs examples match package exports.
- SDKs are cross-language compatible.
- Verification path works offline where promised.

