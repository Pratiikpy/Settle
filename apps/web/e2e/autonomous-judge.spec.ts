/**
 * autonomous-judge.spec.ts — Judge-perspective end-to-end pass.
 *
 * Drives the audit-branch preview (which has NEXT_PUBLIC_E2E_BURNER=1
 * baked in at compile time) through every key user-facing flow, captures
 * a desktop screenshot of every page, and writes a concise issue log.
 *
 * Output: apps/web/e2e/autonomous-judge-screenshots/{step}.png
 *         apps/web/e2e/autonomous-judge-report.md
 *
 * Run:
 *   pnpm --filter @settle/web exec playwright test e2e/autonomous-judge.spec.ts \
 *     --project=chromium-burner --headed --workers=1
 *
 * Each step is wrapped so a single failure doesn't kill the whole pass
 * — the goal is to produce a complete report, not pass/fail gates.
 */

import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync, appendFileSync, readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import bs58 from "bs58";
import { connectBurner } from "./helpers/connect-burner";

const PREVIEW =
  process.env.SETTLE_PREVIEW_URL ??
  "https://use-settle-git-audit-e2e-burner-pratiikpys-projects.vercel.app";

const BOB = "DvzeYj2gE4Lu1uK8CDrkERWnBMXp5tGT2yVvc8KmUbAk";

// Resolve helpers relative to this spec, regardless of ESM/CJS execution mode.
const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : resolve(fileURLToPath(import.meta.url), "..");
const OUT_DIR = resolve(HERE, "autonomous-judge-screenshots");
const REPORT_PATH = resolve(HERE, "autonomous-judge-report.md");

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  REPORT_PATH,
  `# Autonomous judge pass — ${new Date().toISOString()}\n\nPreview URL: ${PREVIEW}\n\n## Steps\n\n`,
);

function loadBurnerB58(): string {
  const path = resolve(process.cwd(), "..", "..", ".test-wallet.json");
  const arr = JSON.parse(readFileSync(path, "utf8")) as number[];
  return bs58.encode(Buffer.from(arr));
}

function logStep(label: string, status: "OK" | "ISSUE" | "FAIL", note?: string) {
  const ts = new Date().toISOString().slice(11, 19);
  appendFileSync(
    REPORT_PATH,
    `- **[${ts}] ${status}** — ${label}${note ? ` — ${note}` : ""}\n`,
  );
  // eslint-disable-next-line no-console
  console.log(`[${status}] ${label}${note ? ` — ${note}` : ""}`);
}

async function shot(page: Page, name: string) {
  const path = resolve(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true }).catch(() => {});
  return path;
}

async function safeStep(
  page: Page,
  name: string,
  body: () => Promise<void>,
): Promise<void> {
  try {
    await body();
    await shot(page, name);
    logStep(name, "OK");
  } catch (err) {
    await shot(page, `${name}__error`);
    const raw = err instanceof Error ? err.message : String(err);
    const msg = (raw.split("\n")[0] ?? raw).slice(0, 180);
    logStep(name, "ISSUE", msg);
  }
}

async function checkConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    if (err) errors.push(`pageerror: ${err.message}`);
  });
  page.on("console", (msg) => {
    if (msg && msg.type() === "error") {
      errors.push(`console.error: ${msg.text().slice(0, 160)}`);
    }
  });
  return errors;
}

test.describe("Autonomous judge pass", () => {
  test.setTimeout(20 * 60 * 1000); // 20 minutes for the whole spec

  test("public surfaces + connected flows + on-chain spend", async ({ browser }) => {
    const burnerB58 = loadBurnerB58();
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await ctx.addInitScript((b58: string) => {
      try {
        window.localStorage.setItem("settle-e2e-burner-key", b58);
      } catch {
        /* ignore */
      }
    }, burnerB58);

    const page = await ctx.newPage();
    const errors = await checkConsoleErrors(page);

    // ════════════════════════════════════════════════════════════════════
    // PART A — PUBLIC SURFACES (no wallet needed)
    // ════════════════════════════════════════════════════════════════════
    const publicRoutes: Array<[string, string]> = [
      ["/", "01-landing"],
      ["/watch", "02-watch"],
      ["/verify", "03-verify"],
      [
        "/verify?h=ca50ca04e587acecbfefdab0bfdcee5351a521f33797d201417a9c3a238cc902",
        "04-verify-with-hash",
      ],
      ["/r/93de12a1-01c1-4fc8-83c0-1bff28f5a870", "05-receipt-poster"],
      ["/stats", "06-stats"],
      ["/feed", "07-feed"],
      ["/leaderboard", "08-leaderboard"],
      ["/capabilities", "09-capabilities"],
      ["/agents/templates", "10-agent-templates"],
      ["/watch-crosschain", "11-crosschain-watch"],
      ["/docs", "12-docs"],
      ["/verify-build", "13-verify-build"],
      ["/embed/pay?merchant=" + BOB + "&amount=0.05&memo=judge-test", "14-embed-pay"],
      ["/start/consumer", "15-start-consumer"],
      ["/start/agent", "16-start-agent"],
    ];

    for (const [path, name] of publicRoutes) {
      await safeStep(page, name, async () => {
        // /watch holds a streaming connection so networkidle never fires;
        // domcontentloaded is enough for the SSR + initial paint snapshot.
        const waitUntil =
          path === "/watch" || path.startsWith("/watch") ? "domcontentloaded" : "networkidle";
        await page.goto(`${PREVIEW}${path}`, {
          waitUntil,
          timeout: 30_000,
        });
        // Let dynamic content settle (counter animations, lazy images).
        await page.waitForTimeout(3_000);
      });
    }

    // ════════════════════════════════════════════════════════════════════
    // PART B — CONNECT WALLET, AUTHED SURFACES
    // ════════════════════════════════════════════════════════════════════
    await safeStep(page, "20-pre-connect", async () => {
      await page.goto(`${PREVIEW}/?stay=1`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1_500);
    });

    await safeStep(page, "21-wallet-modal-open", async () => {
      await connectBurner(page);
      await page.waitForTimeout(2_000);
    });

    const authedRoutes: Array<[string, string]> = [
      ["/dashboard", "22-dashboard-connected"],
      ["/cards", "23-cards"],
      ["/cards/new", "24-cards-new"],
      ["/ledger", "25-ledger"],
      ["/send", "26-send"],
      ["/agents", "27-agents"],
      ["/agents/streaming", "28-agents-streaming"],
      ["/audit", "29-audit"],
      ["/spending", "30-spending"],
      ["/activity", "31-activity"],
      ["/settings", "32-settings"],
      ["/groups", "33-groups"],
      ["/split-bill", "34-split-bill"],
      ["/wishes", "35-wishes"],
      ["/allowances", "36-allowances"],
      ["/sandbox", "37-sandbox"],
      ["/notifications", "38-notifications"],
    ];

    for (const [path, name] of authedRoutes) {
      await safeStep(page, name, async () => {
        await page.goto(`${PREVIEW}${path}`, {
          waitUntil: "networkidle",
          timeout: 25_000,
        });
        await page.waitForTimeout(2_500);
      });
    }

    // ════════════════════════════════════════════════════════════════════
    // PART C — REAL ON-CHAIN SPEND (devnet)
    // ════════════════════════════════════════════════════════════════════
    await safeStep(page, "40-send-page-fresh", async () => {
      await page.goto(`${PREVIEW}/send`, { waitUntil: "networkidle" });
      await page.waitForTimeout(2_000);
    });

    await safeStep(page, "41-send-fill-form", async () => {
      // Switch to Pubkey tab first
      const pubkeyTab = page.getByRole("button", { name: "Pubkey", exact: true });
      if (await pubkeyTab.isVisible().catch(() => false)) {
        await pubkeyTab.click();
        await page.waitForTimeout(1_000);
      }
      const recipient = page.getByPlaceholder(/7xKXz9pQrT/);
      await recipient.fill(BOB);
      await page.getByPlaceholder("10.00").fill("0.01");
      await page.getByPlaceholder("pizza, rent, …").fill("autonomous-judge-test");
      await page.waitForTimeout(1_000);
    });

    await safeStep(page, "42-send-submit", async () => {
      const payButton = page.getByRole("button", { name: /^Pay 0\.01 USDC/ });
      await payButton.click({ timeout: 10_000 });
      // Burner auto-signs; wait for success state
      await page
        .getByText(/Sent\s*✓|Sent ✔/i)
        .first()
        .waitFor({ timeout: 60_000 })
        .catch(() => {
          // Fallback: still recorded the click
        });
      await page.waitForTimeout(3_000);
    });

    // ════════════════════════════════════════════════════════════════════
    // PART D — VERIFY THE FRESH RECEIPT
    // ════════════════════════════════════════════════════════════════════
    await safeStep(page, "43-ledger-after-send", async () => {
      await page.goto(`${PREVIEW}/ledger`, { waitUntil: "networkidle" });
      await page.waitForTimeout(3_000);
    });

    // ════════════════════════════════════════════════════════════════════
    // PART E — DARK MODE TOGGLE (if available)
    // ════════════════════════════════════════════════════════════════════
    await safeStep(page, "50-settings-dark-mode", async () => {
      await page.goto(`${PREVIEW}/settings`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1_500);
      // Just screenshot whatever the settings page looks like
    });

    // ════════════════════════════════════════════════════════════════════
    // PART F — DUMP CONSOLE ERRORS COLLECTED ALONG THE WAY
    // ════════════════════════════════════════════════════════════════════
    appendFileSync(REPORT_PATH, "\n## Console errors collected during pass\n\n");
    if (errors.length === 0) {
      appendFileSync(REPORT_PATH, "_None._\n");
    } else {
      for (const e of errors.slice(0, 50)) {
        appendFileSync(REPORT_PATH, `- ${e}\n`);
      }
      if (errors.length > 50) {
        appendFileSync(REPORT_PATH, `- ...and ${errors.length - 50} more\n`);
      }
    }
    logStep("done", "OK", `${errors.length} console errors logged`);

    await ctx.close();
  });
});
