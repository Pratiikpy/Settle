import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/actions/hire/[slug] — Solana Action endpoint for "Hire this AI agent" Blinks.
 * Returns ActionGetResponse per Solana Actions spec; Phantom renders this directly in Twitter.
 *
 * Wires Day 4: real ActionPostResponse with built tx; Pact PDA derivation; signed Action response.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const response = {
    type: "action",
    title: "Hire this AI agent",
    icon: "https://settle.so/og/agent-card.png",
    description: `Spawn a Pact card for "${slug}". Cap $0.50, 3 merchants allowlisted, 15-min expiry, one-tap revoke.`,
    label: "Hire — $0.50",
    links: {
      actions: [
        { label: "Hire — $0.50 cap", href: `/api/actions/hire/${slug}/spawn` },
        {
          label: "Custom cap",
          href: `/api/actions/hire/${slug}/spawn?cap={cap}`,
          parameters: [{ name: "cap", label: "Cap (USDC)", required: true }],
        },
      ],
    },
  };

  return NextResponse.json(response, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function OPTIONS() {
  return NextResponse.json(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
