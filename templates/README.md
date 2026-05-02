# Settle templates

Drop-in starter repos for the most common merchant deployment targets. Each template is a complete, runnable example — copy the directory, run the named install + start command, and you have a Settle-paid endpoint live.

## Templates

| Template            | Stack                       | Best for                     |
| ------------------- | --------------------------- | ---------------------------- |
| `vercel-edge-mcp`   | Next.js App Router + Edge   | Production HTTPS, global    |
| `replit-express`    | Node 20 + Express           | One-click Replit imports    |
| `cursor-local-mcp`  | Stdio MCP + tsx             | Local dev / Cursor wiring   |

## Provisioning a merchant

Each template assumes you've already scaffolded a merchant:

```bash
npx create-settle-merchant my-merchant
```

Then copy the relevant template directory next to the merchant artifacts and follow its README.

## Future: integrated `--template` flag

`create-settle-merchant my-shop --template vercel-edge-mcp` will fold these into a single command in a later iteration. Today, copy by hand — the templates are 1-3 files each.
