# create-settle-merchant

Scaffold a new Settle merchant in one command.

```bash
npx create-settle-merchant my-shop
```

Generates `./my-shop/` with:

- `merchant.keypair.json` — 64-byte Solana keypair (Anchor / `solana` CLI compatible)
- `.env.template` — copy to `.env`; contains pubkey, webhook signing secret, sample capability hash
- `merchant.md` — README with MCP + HTTP wiring snippets
- `.gitignore` — protects the keypair from accidental commits

## What is Settle?

Programmable payment cards for AI agents and humans on Solana. Every payment commits four BLAKE3 hashes on-chain (request, policy, decision, receipt) so receipts are publicly verifiable.

## Next steps after scaffolding

```bash
cd my-shop
cp .env.template .env
# fill in MERCHANT_WEBHOOK_URL
npm install @settle/mcp-middleware
```

Register your `capability_hash` at <https://settle.so/capabilities> so users see a human-readable alias.

## Local dev / contributors

```bash
pnpm build
node dist/cli.js my-shop
```

## License

MIT
