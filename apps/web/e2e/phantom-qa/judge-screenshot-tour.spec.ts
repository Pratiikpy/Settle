import { test, chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Judge audit: take screenshots of every public-facing page so we can review
 * for visual regressions, broken layouts, missing assets, console errors.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHOTS = resolve(__dirname, "judge-shots");
mkdirSync(SHOTS, { recursive: true });

const BASE = process.env.BASE_URL ?? "https://use-settle.vercel.app";

const ROUTES: Array<{ name: string; path: string; expect?: string }> = [
  { name: "01-landing", path: "/" },
  { name: "02-admin-health", path: "/admin/health" },
  { name: "03-receipts-feed", path: "/feed" },
  { name: "04-capabilities-list", path: "/capabilities" },
  { name: "05-leaderboard", path: "/leaderboard" },
  { name: "06-receipt-detail", path: "/r/87d94764-cfdb-43c9-9361-18d00bde66ee" },
  { name: "07-claimed-handle", path: "/at/b4testvl23aa" },
  { name: "08-pubkey-redirect", path: "/at/B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp" },
  { name: "09-unclaimed-handle", path: "/at/29Az3i81KRa96seMfn13qH8o8eGALcyUYmcuyNaZC2xg" },
  { name: "10-onboarding", path: "/onboarding" },
  { name: "11-cards-new", path: "/cards/new" },
  { name: "12-agents-new", path: "/agents/new" },
  { name: "13-docs", path: "/docs" },
  { name: "14-blink-research", path: "/blink/research" },
  { name: "15-merchants", path: "/merchants" },
];

test.setTimeout(180_000);

test("judge audit screenshot tour", async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors: Array<{ route: string; msg: string }> = [];
  page.on("pageerror", (err) => {
    consoleErrors.push({ route: page.url(), msg: err.message });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({ route: page.url(), msg: msg.text().slice(0, 200) });
    }
  });

  const results: Array<{ name: string; path: string; status: number | string; ms: number }> = [];

  for (const r of ROUTES) {
    const t0 = Date.now();
    let status: number | string = 0;
    try {
      const resp = await page.goto(`${BASE}${r.path}`, {
        waitUntil: "networkidle",
        timeout: 45_000,
      });
      status = resp?.status() ?? 0;
    } catch (e) {
      status = `goto_error: ${(e as Error).message.split("\n")[0]?.slice(0, 80) ?? "?"}`;
    }
    const ms = Date.now() - t0;
    await page
      .screenshot({ path: resolve(SHOTS, `${r.name}.png`), fullPage: true })
      .catch(() => {});
    results.push({ name: r.name, path: r.path, status, ms });
    const icon = status === 200 ? "✓" : status === 404 ? "·" : "✗";
    console.log(`${icon} ${r.name.padEnd(28)} ${r.path.padEnd(60)} [${status}] (${ms}ms)`);
  }

  console.log("\n=== SUMMARY ===");
  const ok = results.filter((r) => r.status === 200).length;
  console.log(`${ok}/${results.length} OK 200`);
  for (const r of results.filter((x) => x.status !== 200)) {
    console.log(`  [${r.status}]  ${r.path}`);
  }
  if (consoleErrors.length > 0) {
    console.log(`\n=== CONSOLE ERRORS (${consoleErrors.length}) ===`);
    for (const e of consoleErrors.slice(0, 20)) {
      console.log(`  ${e.route}: ${e.msg}`);
    }
  } else {
    console.log("\n=== NO CONSOLE ERRORS ===");
  }

  await ctx.close();
  await browser.close();
});
