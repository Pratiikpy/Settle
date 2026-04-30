# @settle/sdk

The public SDK for Settle. **MIT-licensed.**

Use this if you're a merchant accepting Settle payments, an auditor verifying receipts, or another protocol building on hash-committed audit trails on Solana.

## Install (post-mainnet npm publish)

```bash
pnpm add @settle/sdk
```

For now, in the Settle monorepo, `@settle/sdk` is consumed via `workspace:*`.

## Modules

### `verifyReceipt(input)` — auditor's primary API
Recompute the full canonical hash chain and compare against on-chain commits.

```ts
import { verifyReceipt } from "@settle/sdk";

const result = verifyReceipt({
  receipt: { request_id, card_pubkey, pact_pubkey, merchant_pubkey, amount_lamports, capability_hash, purpose_text_hash, decision_slot, policy_version },
  reason: { decision, deny_code, ... },
  policy_snapshot: { policy_version, daily_cap, ... },
  http: { method: "POST", path: "/api/translate" },
  expected: { receipt_hash, reason_hash, policy_snapshot_hash, purpose_hash },
});

if (result.ok) {
  console.log("All 4 hashes match — receipt is authentic.");
} else {
  console.error("Mismatches:", result.mismatches);
}
```

### `verifyWebhookSignature(input)` — for merchants receiving webhooks
HMAC-SHA256 verification with constant-time comparison.

```ts
import { verifyWebhookSignature } from "@settle/sdk";

app.post("/settle-webhook", express.raw({ type: "application/json" }), (req, res) => {
  const ok = verifyWebhookSignature({
    bodyBytes: req.body,
    signatureHex: req.header("X-Settle-Signature") ?? "",
    secret: process.env.SETTLE_WEBHOOK_SECRET ?? "",
  });
  if (!ok) return res.status(401).end();
  // process the webhook…
});
```

### `sealedBoxEncryptToPubkey(plaintext, recipientPub)` — sealed-box encryption
X25519 + XChaCha20-Poly1305. Anyone can encrypt to a pubkey; only the privkey holder decrypts.

```ts
import { sealedBoxKeygen, sealedBoxEncryptToPubkey, sealedBoxDecryptString } from "@settle/sdk";

const { publicKey, privateKey } = sealedBoxKeygen();
const sealed = sealedBoxEncryptToPubkey("secret message", publicKey);
const plaintext = sealedBoxDecryptString(sealed, privateKey);
```

### `parseHandleInput(input)` — handle/SNS/pubkey parser
```ts
import { parseHandleInput, displayHandle } from "@settle/sdk";

parseHandleInput("@elena");        // { kind: "settle", value: "elena" }
parseHandleInput("elena.sol");     // { kind: "sns", value: "elena.sol" }
parseHandleInput("Card11...111a"); // { kind: "pubkey", value: "Card11..." }
```

### Canonical hashing — `canonicalReceiptHash`, `canonicalReasonHash`, `canonicalPolicySnapshotHash`, `canonicalPurposeHash`
The 4 BLAKE3 hashes that make up Settle's commitment chain. Strict zod schemas + sorted-keys canonical JSON.

### PDA derivation — `findAgentCardPda`, `findPactPda`, `labelHashBytes`
Match the Anchor program's seeds byte-for-byte.

### IDL — `SETTLE_IDL`, `SETTLE_PROGRAM_ID`
The Anchor IDL JSON for `settle-agent-card` v0.1.0. Codama codegen will generate a kit-native client from this once `anchor build` runs.

### Types — `DenyCode`, `PolicyDecision`, `CanonicalReceipt`, `CanonicalReason`, `CanonicalPolicySnapshot`, `AgentCredentialEnvelope`, `AgentRequestPayload`
Re-exported from `@settle/types`.

## Tests

71 tests across 5 files:
- `canonical.test.ts` — 30 tests on hash chain
- `verify-receipt.test.ts` — 7 tests on round-trip
- `handles.test.ts` — 12 tests on parser
- `webhook-verify.test.ts` — 9 tests on HMAC
- `sealed-box.test.ts` — 13 tests on encryption + tamper-resistance

Run via `pnpm --filter @settle/sdk test`.
