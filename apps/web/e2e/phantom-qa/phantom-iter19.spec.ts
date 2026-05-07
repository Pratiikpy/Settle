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
const SHOTS = resolve(HERE, "screenshots-iter19");
const REPORT = resolve(HERE, "phantom-iter19-log.md");
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

test.describe("iter19 admin surfaces + Bug #50 verify", () => {
  test.setTimeout(15 * 60 * 1000);

  test("admin pages + /at/<pubkey> empty-state regression check", async () => {
    writeFileSync(REPORT, `# iter19 ${new Date().toISOString()}\n\n`);
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

    // === Admin surfaces ===
    log("=== Admin surfaces ===");
    for (const [path, name] of [
      ["/admin", "i19-01-admin-root"],
      ["/admin/cron", "i19-02-admin-cron"],
      ["/admin/federation", "i19-03-admin-federation"],
      ["/admin/health", "i19-04-admin-health"],
      ["/admin/preflight", "i19-05-admin-preflight"],
    ] as const) {
      try {
        await page.goto(`${PRODUCTION}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await sleep(3_500);
        await shot(page, name);
        log(`admin: ${path} -> ${page.url()}`);
      } catch (e) {
        log(`admin ${path} failed: ${(e as Error).message.split("\n")[0]}`);
      }
    }

    // === Bug #50 — /at/<pubkey> regression ===
    // Recipient wallet B4cArR1M... is unclaimed. Pre-fix this rendered
    // the generic "Profile unavailable" dead-end. Post-fix it should
    // render the "No handle claimed" empty state with /m/<pubkey> +
    // /send?to=<pubkey> CTAs.
    log("=== Bug #50 verify ===");
    const recipient = "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp";
    await page.goto(`${PRODUCTION}/at/${recipient}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await sleep(5_000);
    await shot(page, "i19-10-at-pubkey-empty-state");
    const text = await page.evaluate(() => document.body.innerText.slice(0, 1500));
    log(`/at/<pubkey> body text:\n${text}`);
    if (text.includes("No handle claimed")) {
      log("PASS: Bug #50 fix is live");
    } else if (text.includes("Profile unavailable")) {
      log("FAIL: Bug #50 fix not yet deployed (still showing Profile unavailable)");
    } else {
      log("UNKNOWN: page rendered something else");
    }

    // Click "Send to this wallet" CTA to confirm linkout
    try {
      const sendCta = page.locator("a:has-text('Send to this wallet')").first();
      if (await sendCta.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await sendCta.click();
        await sleep(3_500);
        await shot(page, "i19-11-send-prefilled");
        log(`send page url: ${page.url()}`);
      }
    } catch (e) {
      log(`send-cta click failed: ${(e as Error).message.split("\n")[0]}`);
    }

    log("END");
    await ctx.close();
  });
});
