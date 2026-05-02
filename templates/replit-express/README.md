# replit-express

Settle merchant on Node 20 + Express. One paid HTTP endpoint at `POST /summarize`. Imports cleanly into Replit with a single click.

## What you get

- Plain `index.ts` with one Express route
- `requireSettleCredential` gates the endpoint
- `package.json` configured for Replit's Node 20 image

## Prerequisites

```bash
npx create-settle-merchant my-shop
```

## Local run

```bash
cd replit-express
cp ../my-shop/.env.template .env
npm install
npm run start
# server on http://localhost:3000
```

Test the gate:

```bash
# without credential → 402
curl -X POST http://localhost:3000/summarize -d '{"text":"hello"}' -H 'content-type: application/json'

# with credential (base64url-encoded JSON of the agent's signed envelope)
curl -X POST http://localhost:3000/summarize \
  -d '{"text":"long article…"}' \
  -H 'content-type: application/json' \
  -H 'x-settle-credential: <base64url>'
```

## Replit one-click

1. New Repl → Import from GitHub → paste this directory's URL.
2. Replit auto-detects Node 20 + `npm install` runs.
3. Add `MERCHANT_PUBKEY`, `SETTLE_ENDPOINT`, `SETTLE_DEMO_CAPABILITY_HASH`, `SETTLE_DEMO_AMOUNT_LAMPORTS` in the Secrets panel.
4. Hit Run. Replit's webview shows the live URL.
