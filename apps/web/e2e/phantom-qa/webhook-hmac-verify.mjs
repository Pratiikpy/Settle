#!/usr/bin/env node
/**
 * Webhook HMAC sign+verify roundtrip — proves the merchant-side
 * webhook receiver code path works end-to-end.
 *
 * Settle signs every outbound webhook with HMAC-SHA256 over the
 * canonical body bytes, keyed by the merchant's signing_secret. The
 * signature lands in the X-Settle-Signature header.
 *
 * This driver:
 *   1. Crafts a Stripe-shaped webhook envelope (mimicking what Settle's
 *      delivery worker would POST to a merchant).
 *   2. Signs it via signWebhookPayload(body, secret).
 *   3. Verifies it via verifyWebhookSignature({body, sig, secret}).
 *   4. Runs negative tests: wrong secret + tampered body + missing
 *      signature → all must reject.
 */

import {
  signWebhookPayload,
  verifyWebhookSignature,
} from "../../../../packages/sdk/src/webhook-verify.ts";

let pass = 0, fail = 0;
const log = (ok, name, detail) => {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const SECRET = "wh_test_secret_v1_eyJhbGciOiJIUzI1NiJ9";

// Stripe-shaped event envelope (this is what Settle's delivery worker POSTs)
const event = {
  id: "evt_01HCXZ4F8KG2PR4TKS5W5YQM3T",
  type: "receipt.created",
  created: 1778163027,
  data: {
    object: {
      request_id: "87d94764-cfdb-43c9-9361-18d00bde66ee",
      decision: "ALLOW",
      amount_lamports: "10000",
      merchant_pubkey: "29Az3i81KRa96seMfn13qH8o8eGALcyUYmcuyNaZC2xg",
      sig_solscan: "2s71RsGr...jNMk",
    },
  },
};

const bodyBytes = Buffer.from(JSON.stringify(event), "utf8");

// 1. Sign
const sig = signWebhookPayload(bodyBytes, SECRET);
log(/^[0-9a-f]{64}$/.test(sig), "1. signWebhookPayload returns 64-char hex (HMAC-SHA256)", `${sig.slice(0, 16)}…`);

// 2. Verify with correct secret + signature
const verifyOk = verifyWebhookSignature({
  bodyBytes,
  signatureHex: sig,
  secret: SECRET,
});
log(verifyOk, "2. Verify roundtrip with correct secret + signature");

// 3. Wrong secret → must reject
const wrongSecret = verifyWebhookSignature({
  bodyBytes,
  signatureHex: sig,
  secret: "wh_attacker_guessed_wrong",
});
log(!wrongSecret, "3. Reject with wrong secret");

// 4. Tampered body → must reject
const tampered = Buffer.from(JSON.stringify({ ...event, data: { object: { ...event.data.object, amount_lamports: "999999" } } }), "utf8");
const tamperedOk = verifyWebhookSignature({
  bodyBytes: tampered,
  signatureHex: sig,
  secret: SECRET,
});
log(!tamperedOk, "4. Reject when body tampered (amount changed 10000 → 999999)");

// 5. Missing signature → must reject
const missingSig = verifyWebhookSignature({
  bodyBytes,
  signatureHex: "",
  secret: SECRET,
});
log(!missingSig, "5. Reject when signature is empty");

// 6. Missing secret → must reject
const missingSecret = verifyWebhookSignature({
  bodyBytes,
  signatureHex: sig,
  secret: "",
});
log(!missingSecret, "6. Reject when secret is empty");

// 7. Wrong-length signature (32-char hex instead of 64) → must reject
const truncatedSig = sig.slice(0, 32);
const truncatedOk = verifyWebhookSignature({
  bodyBytes,
  signatureHex: truncatedSig,
  secret: SECRET,
});
log(!truncatedOk, "7. Reject truncated signature");

// 8. String body input also works (not just Buffer)
const sigFromString = signWebhookPayload(JSON.stringify(event), SECRET);
const verifyString = verifyWebhookSignature({
  bodyBytes: JSON.stringify(event),
  signatureHex: sigFromString,
  secret: SECRET,
});
log(verifyString && sigFromString === sig, "8. String body roundtrip matches Buffer-body sig");

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
