import { test, chromium, type BrowserContext } from "@playwright/test";
import { mkdirSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : resolve(fileURLToPath(import.meta.url), "..");

const PHANTOM_EXT = resolve(HERE, "phantom-unpacked");
const PHANTOM_ID = "bfnaelmomeimhlpmgjnjophhpkkoljpa";
const PHANTOM_PWD = "12345678";
const SHOTS = resolve(HERE, "screenshots-iter21");
mkdirSync(SHOTS, { recursive: true });

const PRODUCTION = "https://use-settle.vercel.app";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test.describe("iter21 post-Bug26-redeploy baseline", () => {
  test.setTimeout(5 * 60 * 1000);

  test("capture /admin/health post-deploy", async () => {
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
    await sleep(4_000);
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
    } catch {}
    await unlock.close().catch(() => {});

    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${PRODUCTION}/admin/health`, { waitUntil: "domcontentloaded" });
    await sleep(4_000);
    await page.screenshot({ path: resolve(SHOTS, "i21-01-admin-health-post-deploy.png"), fullPage: true });

    // Capture a 2nd shot focused on the failures section so the
    // ↳ error_message diagnostic is clearly visible
    const failuresSection = page.locator("h2:has-text('failures last 24h')").first();
    if (await failuresSection.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await page.screenshot({ path: resolve(SHOTS, "i21-02-failures-detail.png"), fullPage: true, clip: { x: 280, y: 400, width: 880, height: 600 } });
    }

    // Capture /admin/cron too (operator's other diagnostic)
    await page.goto(`${PRODUCTION}/admin/cron`, { waitUntil: "domcontentloaded" });
    await sleep(3_500);
    await page.screenshot({ path: resolve(SHOTS, "i21-03-admin-cron.png"), fullPage: true });

    await ctx.close();
  });
});
