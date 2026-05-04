import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { validateSignRequest } from "@settle/sdk";
import { awaitSignature } from "../../../../lib/ika/sign-flow";

export const runtime = "nodejs";

/**
 * POST /api/crosschain/sign
 *
 * Server-side bridge for the Ika gRPC `SubmitTransaction` call. Accepts the
 * client's already-CPI-approved sign request payload, forwards it to the Ika
 * gRPC service, and polls the on-chain `MessageApproval` PDA for the
 * resulting signature (or surfaces a timeout error).
 *
 * Phase C: this endpoint is a STUB. It accepts requests, validates inputs,
 * and returns a clearly-labelled "not_implemented" response. The full gRPC
 * client wiring lands in Phase D when `lib/ika/grpc-client.ts` and
 * `lib/ika/sign-flow.ts` are implemented.
 *
 * Why server-side? Three reasons:
 *   1. The Ika gRPC service may require auth headers we don't want to ship
 *      to the browser.
 *   2. The polling loop (await MessageApproval status=Signed) is easier to
 *      orchestrate server-side without browser fetch/timeout limits.
 *   3. Future versions may need to attach signed envelopes from a Settle
 *      operator key — that key never belongs in browser-exposed code.
 *
 * Request body (JSON):
 *   {
 *     "card_pubkey": string,        // CrosschainCard PDA (base58)
 *     "request_id": string,         // UUID v4
 *     "message_digest_hex": string, // 64-char lowercase hex (keccak256 of the cross-chain tx)
 *     "user_pubkey_hex": string,    // 64-char lowercase hex
 *     "signature_scheme": number,   // 0..6
 *     "approval_pda": string,       // base58 — the MessageApproval PDA we expect to be created
 *     "timeout_ms"?: number         // optional poll timeout, default 15000
 *   }
 *
 * Response:
 *   200 — { ok: true, signature_hex: string, scheme: number }
 *   202 — { ok: false, status: "pending", retry_after_ms: number }    (poll-again hint)
 *   400 — { error: "invalid_payload", details }
 *   501 — { error: "not_implemented", phase: "C", note: "..." }       (Phase C stub)
 *   502 — { error: "ika_unreachable", details }
 *   504 — { error: "ika_timeout", details }
 */

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", hint: "POST a JSON body" },
      { status: 400 },
    );
  }

  // Validate via the shared SDK schema. Same code path as `crosschain-validation.test.ts`.
  const validated = validateSignRequest(raw);
  if (!validated.ok) {
    return NextResponse.json(
      { error: "invalid_payload", details: validated.errors },
      { status: 400 },
    );
  }
  const body = validated.data;

  // ── Phase D: poll the on-chain MessageApproval PDA for the signature ──
  //
  // The client has already submitted the `request_crosschain_sign` Solana ix
  // (which CPI'd `approve_message` on the Ika dWallet program, allocating
  // the approval PDA). The Ika network's NOA writes the signature into that
  // PDA when it has been produced. This endpoint polls until status flips
  // to `signed` or the timeout expires, then returns the signature bytes.
  //
  // We do this server-side rather than client-side for two reasons:
  //   1. The default Solana RPC may rate-limit a polling browser tab;
  //      we use a private RPC via the SOLANA_RPC_URL env var.
  //   2. Some client polling environments (notably Brave's network shield
  //      and corporate proxies) interfere with long-poll semantics; doing
  //      it server-side gives us a single fetch call from the browser.
  //
  // A 202 response means "still pending after timeout — call us again".
  // The client should use exponential backoff on subsequent polls.

  const rpcUrl = process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  let approval: Awaited<ReturnType<typeof awaitSignature>>;
  try {
    approval = await awaitSignature(
      connection,
      new PublicKey(body.approval_pda),
      { timeoutMs: body.timeout_ms ?? 15_000, intervalMs: 800 },
    );
  } catch (err) {
    // Network error reaching Solana RPC — surface clearly so the UI shows a
    // useful message instead of a generic 500.
    return NextResponse.json(
      {
        error: "solana_rpc_unreachable",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  if (approval.status === "signed" && approval.signature) {
    const sigHex = Array.from(approval.signature)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return NextResponse.json(
      {
        ok: true,
        status: "signed",
        signature_hex: sigHex,
        signature_scheme: approval.signatureScheme,
        epoch: approval.epoch !== null ? approval.epoch.toString() : null,
        request_id: body.request_id,
      },
      { status: 200 },
    );
  }

  if (approval.status === "missing") {
    // The on-chain ix that creates this PDA hasn't landed yet, or the PDA
    // was passed wrong. Either way we can't produce a signature for this
    // request id, so 404 is more accurate than 202.
    return NextResponse.json(
      {
        error: "approval_pda_missing",
        message:
          "The MessageApproval PDA does not exist on chain. Ensure the request_crosschain_sign ix has confirmed before polling.",
        approval_pda: body.approval_pda,
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      status: "pending",
      retry_after_ms: 1500,
      request_id: body.request_id,
    },
    { status: 202 },
  );
}
