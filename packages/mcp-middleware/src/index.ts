/**
 * @settle/mcp-middleware — F5.7
 *
 * One-line wrap to make any MCP tool handler Settle-aware.
 *
 *   import { wrapWithSettle } from "@settle/mcp-middleware";
 *
 *   server.setRequestHandler(CallToolRequestSchema, wrapWithSettle({
 *     handler: async (request) => {
 *       // ... your existing tool implementation
 *       return { content: [{ type: "text", text: "result" }] };
 *     },
 *     pricing: {
 *       "translate": { amount_lamports: "20000", capability_hash: "<hex>" },
 *       "summarize": { amount_lamports: "30000", capability_hash: "<hex>" },
 *     },
 *     settleEndpoint: "https://settle.so",
 *     merchantPubkey: "<your-merchant-pubkey>",
 *   }));
 *
 * The wrapper:
 *   1. Reads the agent's Settle credential from request._meta?.settle_credential.
 *      Format: { card_pubkey, agent_pubkey, signature, nonce, expires_at }.
 *   2. Validates it against the configured Settle endpoint via the
 *      facilitator-style spend protocol — calls /api/x402/proxy/[merchant]
 *      with X-Settle-Credential.
 *   3. On ALLOW: invokes the original handler, returns its result.
 *   4. On DENY or missing credential: throws an MCP-shaped error with
 *      payment-required semantics (code -32001, error.data.settle = …)
 *      that an agent runtime can surface back to the user.
 *
 * Why this is the right shape:
 *   - Devs with existing MCP servers add 1 import + 1 wrap call. No
 *     auth/billing logic in their handlers.
 *   - The wrap is per-handler, so one server can have free tools + paid
 *     tools side-by-side.
 *   - All Settle-specific complexity lives here; the host MCP server
 *     stays vanilla.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Types — minimal shape we need from the MCP request, defined locally so we
// don't need a hard dep on @modelcontextprotocol/sdk. Hosts that DO use the
// official SDK can pass its types straight in; structural typing covers it.
// ─────────────────────────────────────────────────────────────────────────────

export interface McpToolRequest {
  params: {
    name: string;
    arguments?: Record<string, unknown> | undefined;
    _meta?: {
      /** Settle credential envelope. JSON-encoded into the _meta field by
       *  Settle-aware agent runtimes. */
      settle_credential?: SettleCredentialEnvelope | string;
    };
  };
  /** Some MCP runtimes carry _meta on the request itself; some put it on
   *  params. Support both. */
  _meta?: McpToolRequest["params"]["_meta"];
}

export interface McpToolResponse {
  content: Array<{ type: string; text?: string; [k: string]: unknown }>;
  isError?: boolean;
  [k: string]: unknown;
}

export type McpHandler = (req: McpToolRequest) => Promise<McpToolResponse>;

// ─────────────────────────────────────────────────────────────────────────────
// Settle credential — what the agent presents to the merchant's MCP server.
// ─────────────────────────────────────────────────────────────────────────────

export const SettleCredentialSchema = z.object({
  /** AgentCard pubkey on Solana — base58. */
  card_pubkey: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  /** Agent's pubkey (matches card.agent_pubkey). */
  agent_pubkey: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  /** Signature over canonical envelope hash, hex. Verified against agent_pubkey. */
  signature_hex: z.string().regex(/^[0-9a-f]{128}$/i),
  /** Nonce — UUID v4. Replay protection. */
  nonce: z.string().uuid(),
  /** Unix seconds. The credential is rejected if now > expires_at. */
  expires_at: z.number().int(),
});
export type SettleCredentialEnvelope = z.infer<typeof SettleCredentialSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Pricing per tool name. The capability_hash should be registered in
// /capabilities so consumers see human aliases.
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolPricing {
  /** USDC amount in lamports (6 decimals: "1000000" = 1 USDC). */
  amount_lamports: string;
  /** 32-byte hex capability hash. Compute via @settle/sdk computeCapabilityHashHex. */
  capability_hash: string;
  /** Optional human-readable description of what this tool does. */
  description?: string;
}

export interface SettleMcpOptions {
  /** Original MCP tool handler. */
  handler: McpHandler;
  /** Map of tool name → pricing. Tools NOT in this map are free / not metered. */
  pricing: Record<string, ToolPricing>;
  /** Base URL of a Settle facilitator. e.g. "https://settle.so". */
  settleEndpoint: string;
  /** Merchant's pubkey — receives the USDC. */
  merchantPubkey: string;
  /**
   * Optional: log every spend attempt (success or failure) for the host's
   * own audit log. Default: console.log.
   */
  log?: (event: SpendAuditEvent) => void;
}

export interface SpendAuditEvent {
  ts: string;
  tool_name: string;
  card_pubkey: string;
  agent_pubkey: string;
  amount_lamports: string;
  outcome: "allowed" | "denied" | "missing_credential" | "validation_error" | "settle_unreachable";
  message?: string;
  receipt_request_id?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors — MCP uses JSON-RPC error codes. -32001..-32099 reserved for app.
// ─────────────────────────────────────────────────────────────────────────────

export class SettlePaymentRequiredError extends Error {
  code = -32001;
  data: {
    settle: {
      reason: "missing_credential" | "denied" | "validation_error";
      tool_name: string;
      pricing?: ToolPricing;
      pay_url?: string;
    };
  };

  constructor(args: SettlePaymentRequiredError["data"]["settle"] & { tool_name: string }) {
    super(`Settle payment required for ${args.tool_name}: ${args.reason}`);
    this.name = "SettlePaymentRequiredError";
    this.data = { settle: args };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The wrap.
// ─────────────────────────────────────────────────────────────────────────────

function defaultLog(event: SpendAuditEvent) {
  console.log(`[settle-mcp] ${event.outcome} ${event.tool_name}`, event);
}

/**
 * Reads the credential envelope from request._meta.
 *
 * AU-09-016 fix — MCP spec 2025-06-18 places `_meta` on the REQUEST
 * ENVELOPE. Older Settle-aware clients put it under `params._meta`.
 * Previously we read `params._meta ?? _meta` which would short-circuit
 * if `params._meta` was a non-null empty object set by a spec-compliant
 * client. Now we read settle_credential from BOTH locations
 * independently, preferring the envelope (canonical) and falling back
 * to params (legacy).
 *
 * Tolerates both string (JSON-encoded) and object form. Returns null
 * when absent so caller can differentiate "no auth attempted" from
 * "invalid auth".
 */
function readCredential(req: McpToolRequest): SettleCredentialEnvelope | null {
  const raw =
    req._meta?.settle_credential ?? req.params?._meta?.settle_credential;
  if (!raw) return null;
  let parsed: unknown;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  } else {
    parsed = raw;
  }
  const result = SettleCredentialSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/**
 * Calls Settle's facilitator endpoint to validate the credential + atomically
 * record an on-chain spend receipt. Returns { allowed, request_id } on success
 * or null on transport / non-200 errors (which we treat as DENY).
 *
 * The settle endpoint is /api/x402/proxy/[merchant]. We POST with the headers
 * Settle's facilitator expects:
 *   - X-Settle-Credential: <base64url(JSON(envelope))>
 *   - X-Settle-Capability-Hash: <hex>
 *   - X-Settle-Amount: <lamports>
 *
 * The body is the original tool request (the merchant's "paid surface").
 * The facilitator routes through spend_via_pact, computes the kernel commit,
 * and returns the receipt. If anything in the policy chain fails (revoked,
 * over-cap, etc.), the response indicates DENY.
 */
async function validateAndSpend(args: {
  endpoint: string;
  merchantPubkey: string;
  credential: SettleCredentialEnvelope;
  pricing: ToolPricing;
  toolName: string;
  toolArguments: unknown;
}): Promise<{ allowed: boolean; request_id?: string; reason?: string } | null> {
  const url = `${args.endpoint.replace(/\/$/, "")}/api/x402/proxy/${args.merchantPubkey}`;
  const credentialHeader = Buffer.from(
    JSON.stringify(args.credential),
    "utf8",
  ).toString("base64url");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Settle-Credential": credentialHeader,
        "X-Settle-Capability-Hash": args.pricing.capability_hash,
        "X-Settle-Amount": args.pricing.amount_lamports,
        "X-Settle-Tool-Name": args.toolName,
      },
      body: JSON.stringify({ name: args.toolName, arguments: args.toolArguments }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      // Read the body so we can surface the actual reason.
      let reason = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        reason = j.message || j.error || reason;
      } catch {
        // ignore
      }
      return { allowed: false, reason };
    }
    const json = (await res.json()) as {
      ok?: boolean;
      decision?: "ALLOW" | "DENY" | "REVIEW";
      request_id?: string;
      message?: string;
    };
    const out: { allowed: boolean; request_id?: string; reason?: string } = {
      allowed: json.decision === "ALLOW",
    };
    if (json.request_id) out.request_id = json.request_id;
    if (json.message) out.reason = json.message;
    return out;
  } catch (e) {
    return { allowed: false, reason: (e as Error).message };
  }
}

/**
 * THE wrap. Returns a new handler that does pact-auth + settlement before
 * delegating to the original handler.
 */
export function wrapWithSettle(opts: SettleMcpOptions): McpHandler {
  const log = opts.log ?? defaultLog;
  return async function settleWrappedHandler(
    request: McpToolRequest,
  ): Promise<McpToolResponse> {
    const toolName = request.params?.name ?? "unknown";
    const pricing = opts.pricing[toolName];

    // Free tool — pass through.
    if (!pricing) {
      return opts.handler(request);
    }

    const credential = readCredential(request);
    if (!credential) {
      log({
        ts: new Date().toISOString(),
        tool_name: toolName,
        card_pubkey: "",
        agent_pubkey: "",
        amount_lamports: pricing.amount_lamports,
        outcome: "missing_credential",
      });
      throw new SettlePaymentRequiredError({
        reason: "missing_credential",
        tool_name: toolName,
        pricing,
        pay_url: `${opts.settleEndpoint}/agents`,
      });
    }

    if (credential.expires_at * 1000 < Date.now()) {
      log({
        ts: new Date().toISOString(),
        tool_name: toolName,
        card_pubkey: credential.card_pubkey,
        agent_pubkey: credential.agent_pubkey,
        amount_lamports: pricing.amount_lamports,
        outcome: "validation_error",
        message: "credential expired",
      });
      throw new SettlePaymentRequiredError({
        reason: "validation_error",
        tool_name: toolName,
        pricing,
      });
    }

    const result = await validateAndSpend({
      endpoint: opts.settleEndpoint,
      merchantPubkey: opts.merchantPubkey,
      credential,
      pricing,
      toolName,
      toolArguments: request.params.arguments ?? {},
    });

    if (!result || !result.allowed) {
      const event: SpendAuditEvent = {
        ts: new Date().toISOString(),
        tool_name: toolName,
        card_pubkey: credential.card_pubkey,
        agent_pubkey: credential.agent_pubkey,
        amount_lamports: pricing.amount_lamports,
        outcome: result === null ? "settle_unreachable" : "denied",
      };
      if (result?.reason) event.message = result.reason;
      log(event);
      throw new SettlePaymentRequiredError({
        reason: "denied",
        tool_name: toolName,
        pricing,
      });
    }

    const allowedEvent: SpendAuditEvent = {
      ts: new Date().toISOString(),
      tool_name: toolName,
      card_pubkey: credential.card_pubkey,
      agent_pubkey: credential.agent_pubkey,
      amount_lamports: pricing.amount_lamports,
      outcome: "allowed",
    };
    if (result.request_id) allowedEvent.receipt_request_id = result.request_id;
    log(allowedEvent);

    return opts.handler(request);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: when a host doesn't use MCP but wants the same payment-gate model
// for plain HTTP endpoints, expose `requireSettleCredential` as a Next.js /
// Express middleware factory. Same validation logic, no MCP-shaped requests.
// ─────────────────────────────────────────────────────────────────────────────

export function requireSettleCredential(opts: {
  pricing: ToolPricing;
  settleEndpoint: string;
  merchantPubkey: string;
  log?: (event: SpendAuditEvent) => void;
}) {
  const log = opts.log ?? defaultLog;
  return async function check(headers: Record<string, string | string[] | undefined>) {
    const credentialHeader =
      typeof headers["x-settle-credential"] === "string"
        ? (headers["x-settle-credential"] as string)
        : undefined;
    if (!credentialHeader) {
      log({
        ts: new Date().toISOString(),
        tool_name: "(http)",
        card_pubkey: "",
        agent_pubkey: "",
        amount_lamports: opts.pricing.amount_lamports,
        outcome: "missing_credential",
      });
      return {
        allowed: false,
        reason: "missing_credential" as const,
      };
    }
    let credential: SettleCredentialEnvelope;
    try {
      const decoded = Buffer.from(credentialHeader, "base64url").toString("utf8");
      credential = SettleCredentialSchema.parse(JSON.parse(decoded));
    } catch {
      return { allowed: false, reason: "validation_error" as const };
    }
    const r = await validateAndSpend({
      endpoint: opts.settleEndpoint,
      merchantPubkey: opts.merchantPubkey,
      credential,
      pricing: opts.pricing,
      toolName: "(http)",
      toolArguments: {},
    });
    if (!r || !r.allowed) {
      return { allowed: false, reason: "denied" as const };
    }
    return { allowed: true as const, receipt_request_id: r.request_id };
  };
}

export const VERSION = "0.1.0";

// Agent framework adapters (LangChain / Anthropic / OpenAI / CrewAI).
export * from "./agent-adapters.js";
