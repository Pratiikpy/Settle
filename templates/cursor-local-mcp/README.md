# cursor-local-mcp

A local MCP server with one paid tool, ready to drop into Cursor's MCP config. The tool runs on your machine via stdio — no cloud deploy needed. The Settle gate still validates remotely (settle.so) so the on-chain receipt lands.

## What you get

- `server.ts` — vanilla MCP stdio server with one wrapped tool
- `mcp.json` snippet ready to paste into Cursor's `~/.cursor/mcp.json`

## Prerequisites

```bash
npx create-settle-merchant my-merchant
```

## Run locally (manual)

```bash
cd cursor-local-mcp
cp ../my-merchant/.env.template .env
npm install

# Test the server speaks MCP:
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.0"}}}' | npm run start
```

## Wire into Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "settle-demo": {
      "command": "node",
      "args": ["--loader", "tsx", "/absolute/path/to/cursor-local-mcp/server.ts"],
      "env": {
        "MERCHANT_PUBKEY": "<from .env.template>",
        "SETTLE_ENDPOINT": "https://settle.so",
        "SETTLE_DEMO_CAPABILITY_HASH": "<from .env.template>",
        "SETTLE_DEMO_AMOUNT_LAMPORTS": "10000"
      }
    }
  }
}
```

Restart Cursor — the tool appears in your tool palette. Calling it without a Settle credential returns `error.code = -32001` (payment required).

## How it works

`wrapWithSettle` from `@settle/mcp-middleware` wraps the tool's request handler. On every call it reads `_meta.settle_credential`, validates it via the Settle facilitator, and only then runs your business logic. The audit log prints `[settle-mcp] allowed translate {…}` on success.
