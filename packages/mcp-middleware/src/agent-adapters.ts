/**
 * F5.8 — Agent framework adapters.
 *
 * Lets agents built on LangChain / Anthropic Tool Use / OpenAI Tools
 * call paid Settle MCP tools without inventing custom auth. Each adapter
 * wraps the framework's "call this tool" function with a Settle
 * credential injection step.
 *
 * The adapters are FRAMEWORK-NEUTRAL — they don't import LangChain or
 * Anthropic SDKs. Instead they expose a tiny shape the host wires up:
 *   - getCredential(): returns a fresh SettleCredentialEnvelope
 *   - tool transport: the framework's HTTP call
 *
 * This keeps the package <5KB and avoids version-pinning a half-dozen
 * upstream SDKs.
 */

import {
  type SettleCredentialEnvelope,
  SettlePaymentRequiredError,
} from "./index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Credential builder.
//
// In production the credential is signed by the agent's keypair; that
// signing happens in the agent runtime, not here. This adapter just
// pumps a credential builder + a transport call together so the agent
// runtime can ALWAYS attach the right header without per-call glue.
// ─────────────────────────────────────────────────────────────────────────────

export interface CredentialBuilder {
  /** Returns a fresh signed credential each time it's called. */
  (): Promise<SettleCredentialEnvelope> | SettleCredentialEnvelope;
}

/**
 * `attachSettleHeader(credentialBuilder)` returns a function you can call
 * just before any HTTP/MCP request to your merchant. It returns the
 * `X-Settle-Credential` header value as a base64url string, ready to
 * drop into your transport's headers.
 */
export function attachSettleHeader(builder: CredentialBuilder) {
  return async function buildHeader(): Promise<{
    "X-Settle-Credential": string;
  }> {
    const cred = await builder();
    const json = JSON.stringify(cred);
    const b64 = Buffer.from(json, "utf8").toString("base64url");
    return { "X-Settle-Credential": b64 };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LangChain adapter.
//
// LangChain's `Tool` interface has a `_call(input)` method. Wrap it with
// settle-aware fetch — your tool's HTTP backend gets the credential
// header automatically.
// ─────────────────────────────────────────────────────────────────────────────

export interface LangChainToolSpec {
  name: string;
  description: string;
  endpoint: string;
  credentialBuilder: CredentialBuilder;
  /** Optional shape validator; LangChain typically uses zod here. */
  schema?: unknown;
}

export interface LangChainTool {
  name: string;
  description: string;
  schema?: unknown;
  _call(input: unknown): Promise<string>;
}

export function makeLangChainTool(spec: LangChainToolSpec): LangChainTool {
  const buildHeader = attachSettleHeader(spec.credentialBuilder);
  return {
    name: spec.name,
    description: spec.description,
    ...(spec.schema !== undefined ? { schema: spec.schema } : {}),
    async _call(input: unknown): Promise<string> {
      const headers = await buildHeader();
      const res = await fetch(spec.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(input ?? {}),
      });
      if (!res.ok) {
        let detail: { settle?: { pay_url?: string; pricing?: unknown } } = {};
        try {
          const body = await res.json();
          if (body && typeof body === "object") detail = body;
        } catch {
          /* ignore */
        }
        const msg =
          res.status === 402
            ? `Settle payment required: ${spec.name}. Authorize at ${detail.settle?.pay_url ?? "<settle-endpoint>/agents"}`
            : `Tool ${spec.name} returned ${res.status}`;
        throw new Error(msg);
      }
      const text = await res.text();
      return text;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic Tool Use adapter.
//
// Anthropic's Messages API takes a `tools` array and produces `tool_use`
// blocks. This adapter gives you a function that calls your merchant
// with the Settle credential attached, returning the parsed JSON output
// for the next round-trip with Anthropic's API.
// ─────────────────────────────────────────────────────────────────────────────

export interface AnthropicToolRunnerOptions {
  /** Map of tool name → merchant endpoint URL. */
  endpoints: Record<string, string>;
  credentialBuilder: CredentialBuilder;
}

export function makeAnthropicToolRunner(opts: AnthropicToolRunnerOptions) {
  const buildHeader = attachSettleHeader(opts.credentialBuilder);
  return async function runTool(
    toolName: string,
    input: unknown,
  ): Promise<unknown> {
    const url = opts.endpoints[toolName];
    if (!url) {
      throw new Error(`No endpoint registered for tool '${toolName}'`);
    }
    const headers = await buildHeader();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(input ?? {}),
    });
    if (res.status === 402) {
      throw new SettlePaymentRequiredError({
        reason: "denied",
        tool_name: toolName,
      });
    }
    if (!res.ok) {
      throw new Error(`Tool '${toolName}' returned ${res.status}`);
    }
    try {
      return await res.json();
    } catch {
      return await res.text();
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI Tools / function calling — same shape as Anthropic.
// ─────────────────────────────────────────────────────────────────────────────

export const makeOpenAIToolRunner = makeAnthropicToolRunner;

// ─────────────────────────────────────────────────────────────────────────────
// CrewAI adapter.
//
// CrewAI tools subclass `Tool` with a `run(input)` method. Same shape as
// LangChain's `_call`, just renamed.
// ─────────────────────────────────────────────────────────────────────────────

export function makeCrewAITool(spec: LangChainToolSpec) {
  const lc = makeLangChainTool(spec);
  return {
    name: lc.name,
    description: lc.description,
    run(input: unknown) {
      return lc._call(input);
    },
  };
}
