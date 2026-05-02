# vercel-edge-mcp

Production-ready Settle merchant on Vercel Edge runtime. One paid HTTP endpoint at `/api/translate`. Deploys in under 5 minutes.

## What you get

- Next.js 15 (App Router) project skeleton
- `/api/translate` paid endpoint, gated by `requireSettleCredential`
- `vercel.json` with an Edge runtime override
- `.env.example` with the variables the route reads

## Prerequisites

```bash
npx create-settle-merchant my-shop
# remember the values it prints; we'll reference them below
```

## Install + run locally

```bash
cd vercel-edge-mcp
cp ../my-shop/.env.template .env.local
npm install
npm run dev
```

Visit `http://localhost:3000/api/translate` — without a Settle credential it returns 402.

## Deploy to Vercel

```bash
npx vercel --prod
```

Add the `.env.local` values to the Vercel dashboard's environment variables.

## How it works

The Edge route reads the `X-Settle-Credential` header and asks the Settle facilitator at `https://settle.so/api/x402/proxy/<merchant>` to validate + spend before running your business logic. If validation fails, it returns 402 with a `pay_url` so the caller can authorize.

```ts
// app/api/translate/route.ts (essence)
import { requireSettleCredential } from "@settle/mcp-middleware";

export const runtime = "edge";

const check = requireSettleCredential({
  pricing: {
    capability_hash: process.env.SETTLE_DEMO_CAPABILITY_HASH!,
    amount_lamports: process.env.SETTLE_DEMO_AMOUNT_LAMPORTS!,
  },
  settleEndpoint: process.env.SETTLE_ENDPOINT!,
  merchantPubkey: process.env.MERCHANT_PUBKEY!,
});

export async function POST(req: Request) {
  const result = await check(Object.fromEntries(req.headers.entries()));
  if (!result.allowed) return new Response("payment required", { status: 402 });
  const body = await req.json();
  // …your translation logic here…
  return Response.json({ translated: body.text });
}
```
