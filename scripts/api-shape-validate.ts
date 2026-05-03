#!/usr/bin/env tsx
/**
 * Validates JSON response shapes for key API endpoints.
 */
import "dotenv/config";

const HOST = process.env.API_HOST ?? "http://localhost:3000";

interface Check {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  expect: string[];
  notExpect?: string[];
}

const CHECKS: Check[] = [
  {
    path: "/api/feed",
    expect: ["events"],
  },
  {
    path: "/api/stats/landing",
    expect: ["is_presentable"],
  },
  {
    path: "/api/leaderboard",
    expect: ["capabilities"],
  },
  {
    path: "/api/capabilities",
    expect: ["entries"],
  },
  {
    path: "/api/preflight",
    expect: ["counts","checks"],
  },
  {
    path: "/api/price/sol-usd",
    expect: ["usd","symbol"],
  },
  {
    path: "/api/handles/by-pubkey?pubkey=C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY",
    expect: [],  // 200 + valid JSON is enough
  },
  {
    path: "/api/templates",
    expect: ["templates"],
  },
  {
    path: "/api/federation/origins",
    expect: ["origins"],
  },
  {
    path: "/api/balance?pubkey=Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB",
    expect: ["usdc", "sol"],
  },
  {
    path: "/api/dashboard/v6?pubkey=Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB",
    expect: ["today", "agents_on_duty", "recent_receipts"],
  },
  {
    path: "/api/trust/Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB",
    expect: ["score", "tier", "receipts_total"],
  },
];

async function main() {
  console.log("# api-shape-validate");
  let pass = 0;
  let fail = 0;
  for (const c of CHECKS) {
    try {
      const r = await fetch(HOST + c.path, {
        method: c.method ?? "GET",
        headers: c.method === "POST" ? { "Content-Type": "application/json" } : {},
        body: c.body ? JSON.stringify(c.body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
      if (r.status >= 400) {
        console.log(`✗ ${c.path} → ${r.status}`);
        fail++;
        continue;
      }
      const json = (await r.json()) as Record<string, unknown>;
      const missing = c.expect.filter((k) => !(k in json));
      if (missing.length > 0) {
        console.log(`✗ ${c.path} → missing fields: ${missing.join(",")}`);
        fail++;
      } else {
        console.log(`✓ ${c.path} → 200 + ${c.expect.length} fields`);
        pass++;
      }
    } catch (e: any) {
      console.log(`✗ ${c.path} → ${e.message ?? e}`);
      fail++;
    }
  }
  console.log(`\nTotal: ${pass}/${CHECKS.length} pass`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
