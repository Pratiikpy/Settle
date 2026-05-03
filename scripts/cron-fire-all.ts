#!/usr/bin/env tsx
/**
 * Fire all declared cron endpoints with valid auth and report status.
 * Reads vercel.json for the list of declared cron paths.
 */
import "dotenv/config";
import { readFileSync } from "fs";

const HOST = process.env.API_HOST ?? "http://localhost:3000";
const SECRET = process.env.CRON_SECRET;
if (!SECRET) {
  console.error("CRON_SECRET not set");
  process.exit(1);
}

interface VercelCron {
  path: string;
  schedule: string;
}

async function main() {
  const cfg = JSON.parse(readFileSync("apps/web/vercel.json", "utf8")) as { crons: VercelCron[] };
  console.log(`# cron-fire-all — ${cfg.crons.length} declared crons`);
  let ok = 0;
  let fail = 0;
  for (const cron of cfg.crons) {
    const start = Date.now();
    try {
      const r = await fetch(HOST + cron.path, {
        headers: { Authorization: `Bearer ${SECRET}` },
        signal: AbortSignal.timeout(60_000),
      });
      const txt = (await r.text()).slice(0, 200);
      const ms = Date.now() - start;
      if (r.status === 200) {
        console.log(`✓ ${cron.path.padEnd(40)} ${cron.schedule.padEnd(15)} 200 ${ms}ms ${txt.slice(0, 80)}`);
        ok++;
      } else {
        console.log(`✗ ${cron.path.padEnd(40)} ${cron.schedule.padEnd(15)} ${r.status} ${ms}ms ${txt.slice(0, 80)}`);
        fail++;
      }
    } catch (e: any) {
      console.log(`✗ ${cron.path}  → ${e.message ?? e}`);
      fail++;
    }
  }
  console.log(`\nTotal: ${ok} ok / ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
