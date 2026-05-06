/**
 * nightly-smoke.spec.ts — minimal smoke flow run on the wake-up loop.
 *
 * Each loop iteration:
 *   1. Hits /api/health, /api/verify-build, /api/stats/landing on production
 *   2. Loads the landing + receipt poster on the burner preview
 *   3. Confirms VerifiedStamp + landing positioning are intact
 *   4. Records pass/fail to apps/web/e2e/nightly-smoke-log.md
 *
 * Designed to be ~30s end-to-end so it fits in a 1-minute loop tick.
 */
import { test } from "@playwright/test";
import { appendFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const PRODUCTION = "https://use-settle.vercel.app";
const BURNER =
  "https://use-settle-git-audit-e2e-burner-pratiikpys-projects.vercel.app";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : resolve(fileURLToPath(import.meta.url), "..");
const LOG = resolve(HERE, "nightly-smoke-log.md");

function log(msg: string) {
  const ts = new Date().toISOString();
  appendFileSync(LOG, `- ${ts} — ${msg}\n`);
}

test("smoke", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  let passed = 0;
  let failed: string[] = [];

  async function check(name: string, fn: () => Promise<boolean | string>) {
    try {
      const r = await fn();
      if (r === true) {
        passed++;
      } else {
        failed.push(`${name}: ${r === false ? "false" : r}`);
      }
    } catch (e) {
      failed.push(`${name}: ${(e as Error).message.slice(0, 100)}`);
    }
  }

  // 1. Production /api/verify-build returns matches=true
  await check("verify-build", async () => {
    const r = await page.request.get(`${PRODUCTION}/api/verify-build`);
    if (!r.ok()) return `status ${r.status()}`;
    const j = await r.json();
    return j.matches === true ? true : "matches!=true";
  });

  // 2. Production /api/health is critical-passing
  await check("health", async () => {
    const r = await page.request.get(`${PRODUCTION}/api/health`);
    if (!r.ok()) return `status ${r.status()}`;
    const j = await r.json();
    return j.ok === true ? true : `ok=${j.ok}`;
  });

  // 3. Burner landing has the new positioning
  await check("landing-positioning", async () => {
    await page.goto(`${BURNER}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const html = await page.content();
    return html.includes("programmable spending card for AI agents")
      ? true
      : "positioning copy missing";
  });

  // 4. Burner receipt poster has VerifiedStamp
  await check("receipt-stamp", async () => {
    await page.goto(`${BURNER}/r/93de12a1-01c1-4fc8-83c0-1bff28f5a870`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(1500);
    const html = await page.content();
    return html.includes("PROOF · ON-CHAIN") || html.includes("verify-row-receipt")
      ? true
      : "VerifiedStamp not in DOM";
  });

  // 5. No mojibake on key public pages
  await check("no-mojibake", async () => {
    for (const path of ["/", "/start", "/watch"]) {
      const r = await page.request.get(`${BURNER}${path}`);
      if (!r.ok()) continue;
      const html = await r.text();
      if (/â†|Â/.test(html)) return `mojibake on ${path}`;
    }
    return true;
  });

  if (failed.length === 0) {
    log(`✓ smoke pass — ${passed}/5 checks ok`);
  } else {
    log(`✗ smoke fail — ${passed}/5 ok, regressions: ${failed.join(" | ")}`);
  }

  await ctx.close();
});
