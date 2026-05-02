/**
 * /api/translate — paid Settle merchant endpoint.
 *
 * Vercel Edge runtime. Returns 402 unless an X-Settle-Credential header
 * proves the caller has a valid Settle card with budget for this capability.
 */
import { requireSettleCredential } from "@settle/mcp-middleware";

export const runtime = "edge";

const check = requireSettleCredential({
  pricing: {
    capability_hash: process.env.SETTLE_DEMO_CAPABILITY_HASH ?? "",
    amount_lamports: process.env.SETTLE_DEMO_AMOUNT_LAMPORTS ?? "10000",
  },
  settleEndpoint: process.env.SETTLE_ENDPOINT ?? "https://settle.so",
  merchantPubkey: process.env.MERCHANT_PUBKEY ?? "",
});

export async function POST(req: Request): Promise<Response> {
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  const result = await check(headers);
  if (!result.allowed) {
    return Response.json(
      {
        error: "payment_required",
        settle: { reason: result.reason, pay_url: `${process.env.SETTLE_ENDPOINT}/agents` },
      },
      { status: 402 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = body.text ?? "";

  // Replace with your real translation logic. This stub mirrors the input
  // so a happy-path E2E test can confirm the gate opened.
  const translated = `[fr] ${text}`;

  return Response.json({
    translated,
    receipt_request_id: result.allowed ? result.receipt_request_id : null,
  });
}

export async function GET(): Promise<Response> {
  return Response.json({
    name: "translate",
    method: "POST",
    requires: "X-Settle-Credential",
  });
}
