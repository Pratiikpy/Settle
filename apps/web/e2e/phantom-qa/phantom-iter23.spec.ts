import { test, chromium, type BrowserContext, type Page } from "@playwright/test";
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
const SHOTS = resolve(HERE, "screenshots-iter23");
mkdirSync(SHOTS, { recursive: true });

const PRODUCTION = "https://use-settle.vercel.app";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test.describe("iter23 final UI proof — imported receipt + handle profile", () => {
  test.setTimeout(5 * 60 * 1000);

  test("capture imported receipt + claimed handle + verifier in real Phantom", async () => {
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

    const captures: Array<{ url: string; name: string; desc: string }> = [
      {
        url: `${PRODUCTION}/r/87d94764-cfdb-43c9-9361-18d00bde66ee`,
        name: "i23-01-imported-receipt",
        desc: "Imported receipt detail page (the on-chain SPL tx → Settle kernel commit roundtrip)",
      },
      {
        url: `${PRODUCTION}/at/b4testv9l8cq`,
        name: "i23-02-claimed-handle",
        desc: "Claimed handle profile (B4 Test, claimed by id.json)",
      },
      {
        url: `${PRODUCTION}/at/29Az3i81KRa96seMfn13qH8o8eGALcyUYmcuyNaZC2xg`,
        name: "i23-03-no-handle-claimed",
        desc: "Bug #50 fix: unclaimed pubkey shows 'No handle claimed' empty state",
      },
      {
        url: `${PRODUCTION}/at/B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp`,
        name: "i23-04-pubkey-redirects",
        desc: "Bug #50/#52 fix: claimed pubkey URL redirects to /at/b4testv9l8cq",
      },
      {
        url: `${PRODUCTION}/admin/health`,
        name: "i23-05-admin-health",
        desc: "Bug #51 fix: /admin/health with inline ↳ error_message diagnostic",
      },
      {
        url: `${PRODUCTION}/verify`,
        name: "i23-06-verify-page",
        desc: "Verify page — receipt-hash lookup tool",
      },
    ];

    for (const c of captures) {
      console.log(`▶ ${c.name} — ${c.desc}`);
      await page.goto(c.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await sleep(4_500);
      await page.screenshot({ path: resolve(SHOTS, `${c.name}.png`), fullPage: true });
    }

    await ctx.close();
  });
});
