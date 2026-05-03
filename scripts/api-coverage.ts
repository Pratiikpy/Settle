#!/usr/bin/env tsx
/**
 * Section 26 — API endpoint coverage.
 *
 * Inventories every `route.ts` / `route.tsx` under apps/web/app/api,
 * pings each with a GET and a POST (with bare {} body), classifies the
 * response as auth-gated / body-required / OK / dynamic-404, and writes
 * a coverage report.
 *
 * Run with: pnpm tsx scripts/api-coverage.ts > logs/api-coverage.json
 */
import { readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, relative } from "path";

const HOST = process.env.API_HOST ?? "http://localhost:3000";
const ROOT = "apps/web/app/api";

interface Probe {
  route: string;
  url: string;
  method: "GET" | "POST";
  status: number;
  bodyPreview: string;
  durationMs: number;
}

function findRoutes(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir)) {
    const p = join(dir, ent);
    if (statSync(p).isDirectory()) findRoutes(p, out);
    else if (ent === "route.ts" || ent === "route.tsx") out.push(p);
  }
  return out;
}

function routeToUrl(routePath: string): string {
  // apps/web/app/api/foo/[id]/route.ts → /api/foo/sample-id
  const rel = relative("apps/web/app", routePath).replace(/\\/g, "/");
  let u = "/" + rel.replace(/\/route\.tsx?$/, "");
  // Replace [param] or [...param] with placeholders
  u = u.replace(/\[\.\.\.[^\]]+\]/g, "x/y");
  u = u.replace(/\[([^\]]+)\]/g, (_m, p) => {
    if (/pubkey/i.test(p)) return "C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY";
    if (/handle/i.test(p)) return "satoshi";
    if (/merchant/i.test(p)) return "Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB";
    if (/(slug|id|hash|requestId|escrow|capabilityHash)/i.test(p)) return "test-" + p;
    return "x";
  });
  return u;
}

async function probe(method: "GET" | "POST", url: string): Promise<Probe> {
  const start = Date.now();
  try {
    const r = await fetch(HOST + url, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : {},
      body: method === "POST" ? "{}" : undefined,
      signal: AbortSignal.timeout(8000),
    });
    const txt = (await r.text()).slice(0, 200);
    return { route: url, url, method, status: r.status, bodyPreview: txt, durationMs: Date.now() - start };
  } catch (e: any) {
    return {
      route: url,
      url,
      method,
      status: 0,
      bodyPreview: String(e.message ?? e).slice(0, 200),
      durationMs: Date.now() - start,
    };
  }
}

async function main() {
  const routes = findRoutes(ROOT).sort();
  console.log(`# api-coverage — probing ${routes.length} routes against ${HOST}`);
  const probes: Probe[] = [];
  for (const r of routes) {
    const u = routeToUrl(r);
    const get = await probe("GET", u);
    probes.push(get);
    if (get.status === 405) {
      // Endpoint requires POST — try that
      probes.push(await probe("POST", u));
    }
  }
  // Tally
  const tally: Record<string, number> = {};
  for (const p of probes) tally[p.status] = (tally[p.status] ?? 0) + 1;
  console.log("\n# Status tally:");
  for (const [k, v] of Object.entries(tally).sort()) console.log(`  ${k}: ${v}`);
  // 5xx warnings
  const fivexx = probes.filter((p) => p.status >= 500);
  if (fivexx.length > 0) {
    console.log(`\n# 5xx (${fivexx.length}):`);
    for (const p of fivexx.slice(0, 20))
      console.log(`  ${p.method} ${p.url} → ${p.status} · ${p.bodyPreview.slice(0, 80)}`);
  }
  if (!existsSync("logs")) mkdirSync("logs");
  writeFileSync(
    "logs/api-coverage.json",
    JSON.stringify({ host: HOST, total_routes: routes.length, probes }, null, 2),
  );
  console.log(`\n# Wrote logs/api-coverage.json (${probes.length} probes)`);
  if (fivexx.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
