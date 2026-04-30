import { NextResponse } from "next/server";

export const runtime = "edge";

/**
 * GET /api/price/sol-usd
 *
 * Returns the latest SOL/USD price from Pyth Hermes (the official Pyth pull-oracle gateway).
 * Hermes endpoint: https://hermes.pyth.network
 *
 * Used by /send to display USD-equivalent of SOL fees, and by spending insights to
 * convert receipts to USD where the underlying asset wasn't already USDC.
 *
 * Cached at the edge for 30s — Pyth updates roughly every 400ms but we don't need that
 * resolution for UI display.
 */

const SOL_USD_FEED_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

export async function GET() {
  try {
    const url = `https://hermes.pyth.network/v2/updates/price/latest?ids%5B%5D=${SOL_USD_FEED_ID}&parsed=true`;
    const res = await fetch(url, {
      next: { revalidate: 30 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "pyth_fetch_failed", status: res.status },
        { status: 502 },
      );
    }

    const data = await res.json();
    const parsed = data.parsed?.[0];
    if (!parsed?.price?.price) {
      return NextResponse.json({ error: "no_price_in_response" }, { status: 502 });
    }

    // Pyth returns price + expo (negative). real_price = price * 10^expo
    const rawPrice = Number(parsed.price.price);
    const expo = Number(parsed.price.expo);
    const usdPrice = rawPrice * Math.pow(10, expo);
    const conf = Number(parsed.price.conf) * Math.pow(10, expo);

    return NextResponse.json({
      ok: true,
      symbol: "SOL/USD",
      usd: usdPrice,
      confidence: conf,
      publish_time: parsed.price.publish_time,
      feed_id: SOL_USD_FEED_ID,
      source: "Pyth Hermes",
    });
  } catch (e) {
    return NextResponse.json(
      { error: "price_fetch_failed", message: (e as Error).message },
      { status: 502 },
    );
  }
}
