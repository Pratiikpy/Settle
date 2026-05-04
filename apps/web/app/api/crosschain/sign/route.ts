import { NextRequest, NextResponse } from "next/server";
import { validateSignRequest } from "@settle/sdk";

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

  // ── Phase C stub. Phase D fills in the gRPC client + polling loop. ──
  return NextResponse.json(
    {
      error: "not_implemented",
      phase: "C",
      note: "The Ika gRPC bridge lands in Phase D. Phase C confirmed payload validation works; the sign loop itself runs in Phase D.",
      received: {
        card_pubkey: body.card_pubkey,
        request_id: body.request_id,
        signature_scheme: body.signature_scheme,
        approval_pda: body.approval_pda,
      },
    },
    { status: 501 },
  );
}
