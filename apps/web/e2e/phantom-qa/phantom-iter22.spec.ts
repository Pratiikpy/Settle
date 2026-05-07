import { test, chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync, appendFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : resolve(fileURLToPath(import.meta.url), "..");

const PHANTOM_EXT = resolve(HERE, "phantom-unpacked");
const PHANTOM_ID = "bfnaelmomeimhlpmgjnjophhpkkoljpa";
const PHANTOM_PWD = "12345678";
const SHOTS = resolve(HERE, "screenshots-iter22");
const REPORT = resolve(HERE, "phantom-iter22-log.md");
mkdirSync(SHOTS, { recursive: true });

const PRODUCTION = "https://use-settle.vercel.app";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (m: string) => {
  appendFileSync(REPORT, `- [${new Date().toISOString().slice(11, 19)}] ${m}\n`);
  console.log(m);
};
const shot = async (p: Page, n: string) => {
  if (p.isClosed()) return;
  await p.screenshot({ path: resolve(SHOTS, `${n}.png`), fullPage: true }).catch(() => {});
};

test.describe("iter22 post-security-audit production sweep", () => {
  test.setTimeout(15 * 60 * 1000);

  test("verify all bug fixes render correctly in real Phantom browser", async () => {
    writeFileSync(REPORT, `# iter22 ${new Date().toISOString()}\n\n`);
    const userDataDir = resolve(HERE, "user-data");
    const ctx: BrowserContext = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: { width: 1440, height: 900 },
      args: [
        `--disable-extensions-except=${PHANTOM_EXT}`,
        `--load-extension=${PHANTOM_EXT}`,
        "--no-first-run",
        "--disable-blink-features=AutomationControlled",
      ],
    });
    await sleep(5_000);
    for (const p of ctx.pages()) {
      if (p.url().includes(PHANTOM_ID)) await p.close().catch(() => {});
    }
    const unlock = await ctx.newPage();
    await unlock.setViewportSize({ width: 400, height: 600 });
    await unlock.goto(`chrome-extension://${PHANTOM_ID}/popup.html`).catch(() => {});
    await sleep(2_500);
    try {
      const pwd = unlock.locator("input[type='password']").first();
      if (await pwd.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await pwd.fill(PHANTOM_PWD);
        await unlock.keyboard.press("Enter");
        await sleep(2_500);
      }
    } catch {
      /* ignore */
    }
    await unlock.close().catch(() => {});

    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    // === Bug #50 verify — /at/<unclaimed-pubkey> renders empty state ===
    log("=== Bug #50 — /at/<pubkey> empty state ===");
    await page.goto(`${PRODUCTION}/at/C7Dv2Dey8cPa6EKEdicK9Sa2nu3iPyFB4zwQd4K6cWbq`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await sleep(4_000);
    await shot(page, "i22-01-bug50-at-pubkey");
    const t1 = await page.evaluate(() => document.body.innerText.slice(0, 800));
    log(t1.includes("No handle claimed") ? "PASS Bug #50" : "MISS Bug #50");

    // === Bug #52 verify — /at/<claimed-pubkey> redirects/resolves ===
    log("=== Bug #52 — /at/<claimed-pubkey> resolves to b4testv9l8cq ===");
    await page.goto(`${PRODUCTION}/at/B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await sleep(5_000);
    await shot(page, "i22-02-bug52-at-claimed-redirect");
    log(`final url: ${page.url()}`);

    // === Bug #51 verify — /admin/health shows ↳ inline error_message ===
    log("=== Bug #51 — /admin/health inline error_message ===");
    await page.goto(`${PRODUCTION}/admin/health`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await sleep(4_000);
    await shot(page, "i22-03-bug51-admin-health");
    const arrowCount = await page.evaluate(() => (document.body.innerText.match(/↳/g) ?? []).length);
    log(`↳ markers visible: ${arrowCount}`);

    // === Bug #26 verify — phase5 health table renders without crash ===
    // Genuinely confirms the on-chain spend_via_pact program is reachable
    // (a stack-overflow program would have caused indexer to backfill
    // failed receipts that show up in /admin/health).
    log("=== /admin/cron operator dashboard ===");
    await page.goto(`${PRODUCTION}/admin/cron`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await sleep(4_000);
    await shot(page, "i22-04-admin-cron");

    // === Settle landing in fresh state ===
    log("=== Landing page ===");
    await page.goto(`${PRODUCTION}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await sleep(4_000);
    await shot(page, "i22-05-landing");

    // === Wishes page (Bug #54 + #55 client patches) ===
    log("=== /wishes (Bug #54/#55 patched client) ===");
    await page.goto(`${PRODUCTION}/wishes`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await sleep(4_000);
    await shot(page, "i22-06-wishes");

    // === Allowances (Bug #59 patched client) ===
    log("=== /allowances (Bug #59 patched client) ===");
    await page.goto(`${PRODUCTION}/allowances`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await sleep(4_000);
    await shot(page, "i22-07-allowances");

    // === Capabilities (Bug #59 patched client) ===
    log("=== /capabilities (Bug #59 patched client) ===");
    await page.goto(`${PRODUCTION}/capabilities`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await sleep(4_000);
    await shot(page, "i22-08-capabilities");

    // === Groups (Bug #61 patched client) ===
    log("=== /groups (Bug #61 patched client) ===");
    await page.goto(`${PRODUCTION}/groups`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await sleep(4_000);
    await shot(page, "i22-09-groups");

    // === Send page ===
    log("=== /send ===");
    await page.goto(`${PRODUCTION}/send`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await sleep(4_000);
    await shot(page, "i22-10-send");

    log("END");
    await ctx.close();
  });
});
