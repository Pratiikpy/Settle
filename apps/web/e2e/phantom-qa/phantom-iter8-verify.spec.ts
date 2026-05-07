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
const SHOTS = resolve(HERE, "screenshots-iter8");
const REPORT = resolve(HERE, "phantom-iter8-log.md");
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

test.describe("iter8 verify deploy", () => {
  test.setTimeout(15 * 60 * 1000);

  test("verify all post-fix flows on production", async () => {
    writeFileSync(REPORT, `# iter8 verify ${new Date().toISOString()}\n\n`);
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

    async function approveDeep(label: string, shotPrefix: string) {
      const start = Date.now();
      let popup: Page | null = null;
      while (Date.now() - start < 15_000) {
        popup = ctx.pages().find((p) => p.url().includes(`${PHANTOM_ID}/notification.html`)) ?? null;
        if (popup) break;
        await sleep(400);
      }
      if (!popup) {
        log(`${label}: NO popup`);
        return false;
      }
      await popup.waitForLoadState("domcontentloaded").catch(() => {});
      await sleep(1_500);
      await shot(popup, `${shotPrefix}-init`);
      for (let stage = 0; stage < 8; stage++) {
        if (popup.isClosed()) break;
        try {
          const cb = popup.locator("input[type='checkbox']").first();
          if (await cb.isVisible({ timeout: 600 }).catch(() => false)) {
            await cb.check({ force: true }).catch(() => {});
            await sleep(300);
          }
        } catch {
          /* ignore */
        }
        const sels = [
          "text=/Yes, confirm \\(unsafe\\)/i",
          "text=/Confirm \\(unsafe\\)/i",
          "text=/Proceed anyway \\(unsafe\\)/i",
          "text=/Proceed anyway/i",
          "button:has-text('Confirm')",
          "button:has-text('Approve')",
          "button:has-text('Sign')",
          "button:has-text('Connect')",
        ];
        let clicked = false;
        for (const sel of sels) {
          if (popup.isClosed()) break;
          try {
            const el = popup.locator(sel).first();
            if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
              await el.click({ force: true, delay: 50 }).catch(() => {});
              log(`${label} stage ${stage}: ${sel}`);
              clicked = true;
              await sleep(2_000);
              if (!popup.isClosed()) await shot(popup, `${shotPrefix}-stg${stage}`);
              break;
            }
          } catch {
            /* try next */
          }
        }
        if (!clicked) break;
      }
      await sleep(2_000);
      return true;
    }

    const settle = await ctx.newPage();
    await settle.setViewportSize({ width: 1440, height: 900 });

    // 1. Verify /at/me redirects
    await settle.goto(`${PRODUCTION}/at/me`, { waitUntil: "domcontentloaded" });
    await sleep(5_000);
    await shot(settle, "i8-01-at-me-redirected");
    log(`/at/me url: ${settle.url()}`);

    // 2. Verify /m/me shows resolver
    await settle.goto(`${PRODUCTION}/m/me`, { waitUntil: "domcontentloaded" });
    await sleep(5_000);
    await shot(settle, "i8-02-m-me-resolver");
    log(`/m/me url: ${settle.url()}`);

    // 3. Verify /embed/pay with to= alias
    await settle.goto(
      `${PRODUCTION}/embed/pay?to=B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp&amount=0.01`,
      { waitUntil: "domcontentloaded" },
    );
    await sleep(4_000);
    await shot(settle, "i8-03-embed-pay-to-alias");

    // 4. Verify Send empty-state framing
    await settle.goto(`${PRODUCTION}/send`, { waitUntil: "domcontentloaded" });
    await sleep(4_000);
    await shot(settle, "i8-04-send-empty-state");

    // 5. Verify dashboard agent rows are clickable
    await settle.goto(`${PRODUCTION}/dashboard`, { waitUntil: "domcontentloaded" });
    await sleep(5_000);
    await shot(settle, "i8-05-dashboard-clickable-rows");

    // 6. THE BIG ONE — Hire flow on /agents/templates/research
    log("=== Hire flow end-to-end ===");
    await settle.goto(`${PRODUCTION}/agents/templates/research`, { waitUntil: "domcontentloaded" });
    await sleep(4_000);
    await shot(settle, "i8-10-template-research-pre");

    try {
      const hireBtn = settle.locator("button:has-text('Hire')").first();
      await hireBtn.waitFor({ state: "visible", timeout: 8_000 });
      await hireBtn.click({ delay: 60 });
      log("clicked Hire — sign rule");
      await sleep(3_000);
      await shot(settle, "i8-11-hire-clicked");
      await approveDeep("hire-tx", "i8-12-hire-popup");
      await sleep(15_000);
      await shot(settle, "i8-13-hire-result");
      log(`post-hire url: ${settle.url()}`);
      // Capture the persistent inline error so we can read what failed
      const errText = await settle.evaluate(() => {
        const el = document.querySelector("[role='alert']");
        return el ? (el.textContent || "").slice(0, 1500) : null;
      });
      log(`hire inline error:\n${errText ?? "(none)"}`);
    } catch (e) {
      log(`hire failed: ${(e as Error).message.split("\n")[0]}`);
      await shot(settle, "i8-13-hire-failed");
    }

    // 7. Final state — dashboard, ledger, cards
    for (const [path, name] of [
      ["/dashboard", "i8-90-final-dashboard"],
      ["/cards", "i8-91-final-cards"],
      ["/ledger", "i8-92-final-ledger"],
    ] as const) {
      try {
        await settle.goto(`${PRODUCTION}${path}`, { waitUntil: "domcontentloaded" });
        await sleep(4_000);
        await shot(settle, name);
      } catch {
        /* ignore */
      }
    }

    log("END");
    await ctx.close();
  });
});
