import {
  test,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { appendFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : resolve(fileURLToPath(import.meta.url), "..");

const PHANTOM_EXT = resolve(HERE, "phantom-unpacked");
const PHANTOM_ID = "bfnaelmomeimhlpmgjnjophhpkkoljpa";
const PHANTOM_PWD = "12345678";
const SHOTS = resolve(HERE, "screenshots-iter4");
const REPORT = resolve(HERE, "phantom-iter4-log.md");
mkdirSync(SHOTS, { recursive: true });

const PRODUCTION = "https://use-settle.vercel.app";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (m: string) => {
  const line = `- [${new Date().toISOString().slice(11, 19)}] ${m}\n`;
  appendFileSync(REPORT, line);
  console.log(line.trim());
};
const shot = async (p: Page, n: string) => {
  if (p.isClosed()) return;
  await p.screenshot({ path: resolve(SHOTS, `${n}.png`), fullPage: true }).catch(() => {});
};

test.describe("Phantom iter4", () => {
  test.setTimeout(20 * 60 * 1000);

  test("hire-sign-rule, groups, schedule, watch", async () => {
    writeFileSync(REPORT, `# iter4 — ${new Date().toISOString()}\n\n`);
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

    const settle = await ctx.newPage();
    await settle.setViewportSize({ width: 1440, height: 900 });
    await settle.goto(PRODUCTION, { waitUntil: "domcontentloaded" });
    await sleep(3_500);

    // === 1. HIRE FROM AGENT TEMPLATE ===
    log("=== Hire from /agents/templates/research ===");
    try {
      await settle.goto(`${PRODUCTION}/agents/templates/research`, {
        waitUntil: "domcontentloaded",
      });
      await sleep(4_000);
      await shot(settle, "i4-01-template-research");

      const hireBtn = settle
        .locator("button:has-text('Hire'), a:has-text('Hire')")
        .first();
      await hireBtn.waitFor({ state: "visible", timeout: 8_000 });
      await hireBtn.click({ delay: 60 });
      log("clicked Hire — sign rule");
      await sleep(6_000);
      await shot(settle, "i4-02-after-hire-click");
      log(`url after hire: ${settle.url()}`);
      // Capture any visible error toast / modal
      const text = await settle.evaluate(() => document.body.innerText.slice(0, 2000));
      log(`page text after hire:\n${text}`);
    } catch (e) {
      log(`hire failed: ${(e as Error).message.split("\n")[0]}`);
      await shot(settle, "i4-02-hire-failed");
    }

    // === 2. GROUPS ===
    log("=== Groups full inspection ===");
    try {
      await settle.goto(`${PRODUCTION}/groups`, { waitUntil: "domcontentloaded" });
      await sleep(4_000);
      await shot(settle, "i4-10-groups");
      // Capture all visible buttons
      const btns = await settle.evaluate(() =>
        Array.from(document.querySelectorAll("button, a")).map((b) => ({
          tag: b.tagName,
          text: (b.textContent || "").trim().slice(0, 80),
          href: (b as HTMLAnchorElement).href || null,
        })).filter((b) => b.text && b.text.length < 80),
      );
      log(`groups page buttons (${btns.length}):`);
      for (const b of btns.slice(0, 20)) log(`  ${b.tag} "${b.text}" ${b.href ?? ""}`);
    } catch (e) {
      log(`groups failed: ${(e as Error).message.split("\n")[0]}`);
    }

    // === 3. SCHEDULE — fill recurring on /wishes ===
    log("=== Schedule recurring on /wishes ===");
    try {
      await settle.goto(`${PRODUCTION}/wishes`, { waitUntil: "domcontentloaded" });
      await sleep(4_000);
      await shot(settle, "i4-20-wishes");
      // Click "Schedule" tab
      const schedTab = settle.locator("button:has-text('Schedule')").first();
      if (await schedTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await schedTab.click({ delay: 50 });
        await sleep(2_500);
        await shot(settle, "i4-21-schedule-tab");
        // Fill amount + cadence
        const amt = settle.locator("input[type='number']").first();
        if (await amt.isVisible({ timeout: 1_500 }).catch(() => false)) {
          await amt.click();
          await amt.fill("0.10");
        }
        await sleep(800);
        const select = settle.locator("select").first();
        if (await select.isVisible({ timeout: 1_500 }).catch(() => false)) {
          // pick weekly if available
          await select.selectOption({ label: "Weekly" }).catch(() => {});
        }
        await sleep(800);
        await shot(settle, "i4-22-schedule-filled");
        const submit = settle
          .locator("button:has-text('Save'), button:has-text('Create'), button:has-text('Set up')")
          .first();
        if (await submit.isVisible({ timeout: 1_500 }).catch(() => false)) {
          await submit.click({ delay: 50 });
          await sleep(8_000);
          await shot(settle, "i4-23-schedule-after-submit");
        }
      }
    } catch (e) {
      log(`schedule failed: ${(e as Error).message.split("\n")[0]}`);
    }

    // === 4. /watch list (instead of /watch/[id]) ===
    log("=== /watch list ===");
    try {
      await settle.goto(`${PRODUCTION}/watch`, { waitUntil: "domcontentloaded" });
      await sleep(4_000);
      await shot(settle, "i4-30-watch-list");
    } catch {
      /* ignore */
    }

    // === 5. /heatmap ===
    log("=== /heatmap ===");
    try {
      await settle.goto(`${PRODUCTION}/heatmap`, { waitUntil: "domcontentloaded" });
      await sleep(4_000);
      await shot(settle, "i4-31-heatmap");
    } catch {
      /* ignore */
    }

    // === 6. /verify-build ===
    log("=== /verify-build ===");
    try {
      await settle.goto(`${PRODUCTION}/verify-build`, { waitUntil: "domcontentloaded" });
      await sleep(4_000);
      await shot(settle, "i4-32-verify-build");
    } catch {
      /* ignore */
    }

    // === 7. /agents/decisions, /receipts, /caps-rules ===
    for (const [path, name] of [
      ["/agents", "i4-40-agents-overview"],
      ["/agents/cards", "i4-41-agent-cards"],
      ["/agents/pacts", "i4-42-agent-pacts"],
      ["/agents/decisions", "i4-43-agent-decisions"],
      ["/agents/receipts", "i4-44-agent-receipts"],
      ["/agents/caps-and-rules", "i4-45-agent-caps"],
    ] as const) {
      try {
        await settle.goto(`${PRODUCTION}${path}`, { waitUntil: "domcontentloaded" });
        await sleep(3_000);
        await shot(settle, name);
      } catch {
        /* ignore */
      }
    }

    log("END");
    await ctx.close();
  });
});
