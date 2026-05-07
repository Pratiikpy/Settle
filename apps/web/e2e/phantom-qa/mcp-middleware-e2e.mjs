#!/usr/bin/env node
/**
 * @settle/mcp-middleware end-to-end driver — exercises the AI-agent
 * payment middleware surface as an MCP server author would.
 *
 * The middleware lets a tool author wrap any MCP tool with Settle
 * payment gating: callers must include a Settle credential envelope,
 * which the middleware validates + records as a spend audit event.
 */

import {
  SettleCredentialSchema,
  SettlePaymentRequiredError,
  wrapWithSettle,
  requireSettleCredential,
  VERSION,
} from "../../../../packages/mcp-middleware/src/index.ts";

let pass = 0, fail = 0;
const log = (ok, name, detail) => {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

// 1. Version exposed
log(typeof VERSION === "string" && VERSION.length > 0, "MCP VERSION exposed", VERSION);

// 2. SettleCredentialSchema is a Zod schema — try to parse a well-formed envelope
const fakeEnv = {
  card_pubkey: "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp",
  agent_pubkey: "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp",
  signature_hex: "a".repeat(128),
  nonce: "00000000-0000-4000-8000-000000000001",
  expires_at: Math.floor(Date.now() / 1000) + 600,
};
const parseResult = SettleCredentialSchema.safeParse(fakeEnv);
log(parseResult.success, "SettleCredentialSchema parses well-formed envelope");

// 3. Reject malformed envelope
const badParse = SettleCredentialSchema.safeParse({ capability_hash: "not-hex" });
log(!badParse.success, "SettleCredentialSchema rejects malformed envelope");

// 4. requireSettleCredential is a *factory* — returns check(headers)
const checkFn = requireSettleCredential({
  pricing: { amount_lamports: "1000", capability_hash: "x".repeat(64) },
  settleEndpoint: "https://use-settle.vercel.app",
  merchantPubkey: "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp",
  log: () => {},
});
log(typeof checkFn === "function", "requireSettleCredential returns check(headers) function");

// 5. With no header → reason 'missing_credential'
const missingResult = await checkFn({});
log(
  missingResult.allowed === false && missingResult.reason === "missing_credential",
  "check() returns missing_credential when no envelope header",
  `reason=${missingResult.reason}`,
);

// 5a. With malformed header → reason 'validation_error'
const malformedResult = await checkFn({ "x-settle-credential": "not-base64-json" });
log(
  malformedResult.allowed === false && malformedResult.reason === "validation_error",
  "check() returns validation_error on malformed envelope",
  `reason=${malformedResult.reason}`,
);

// 6. wrapWithSettle wraps a tool handler to require credential
const innerCalls = [];
const wrapped = wrapWithSettle({
  handler: async (req) => {
    innerCalls.push(req);
    return { content: [{ type: "text", text: "ok" }] };
  },
  pricing: {
    translate: { amount_lamports: "1000", capability_hash: "x".repeat(64) },
  },
  settleEndpoint: "https://use-settle.vercel.app",
  merchantPubkey: "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp",
  log: () => {}, // silence
});

// 6a. Without credential → SettlePaymentRequiredError
try {
  await wrapped({ params: { name: "translate", arguments: {}, _meta: { headers: {} } } });
  log(false, "wrapped tool blocks unpaid call");
} catch (e) {
  log(e instanceof SettlePaymentRequiredError || /payment|credential/i.test(e.message),
      "wrapped tool blocks unpaid call", e.message?.slice(0, 80));
}

// 6b. Free tool (not in pricing map) → inner runs without credential
innerCalls.length = 0;
try {
  const out = await wrapped({ params: { name: "free_echo", arguments: {} } });
  log(innerCalls.length === 1, "wrapped tool runs inner for un-priced tool (free tier)");
} catch (e) {
  log(false, "free tool", e.message);
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
