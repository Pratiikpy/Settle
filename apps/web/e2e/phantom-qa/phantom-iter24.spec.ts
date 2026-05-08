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
const SHOTS = resolve(HERE, "screenshots-iter24");
const REPORT = resolve(HERE, "phantom-iter24-log.md");
mkdirSync(SHOTS, { recursive: true });

const PRODUCTION = "https://use-settle.vercel.app";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (m: string) => {
  appendFileSync(REPORT, `- [${new Date().toISOString().slice(11, 19)}] ${m}\n`);
  console.log(m);
};

// Concrete-routes only (skip dynamic ones unless we have IDs to substitute)
// Using real values from this session for parameterized routes.
const HANDLE = "b4testv9l8cq";
const PUBKEY = "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp";
const RECEIPT_ID = "87d94764-cfdb-43c9-9361-18d00bde66ee";
const RECEIPT_HASH = "6c2b55edddae357c6b631b54e7f19c6c632b375c07cbce5432b04b19e1bf2924";
const CARD_PUBKEY = "EeFF9FZW2VCfuXdQxjV1Jt6Cjp1NitG6UNpW7zf1Qr4X";
const GROUP_ID = "8af8456a-c02d-4b57-93aa-eaf4e1fb10f4";

const ROUTES: Array<[string, string, string]> = [
  // [name, path, category]
  ["i24-01-landing",                     "/",                                                   "consumer"],
  ["i24-02-dashboard",                   "/dashboard",                                          "consumer"],
  ["i24-03-send",                        "/send",                                               "consumer"],
  ["i24-04-receipts-list",               "/receipts",                                           "consumer"],
  ["i24-05-receipt-detail",              `/r/${RECEIPT_ID}`,                                    "consumer"],
  ["i24-06-cards-list",                  "/cards",                                              "consumer"],
  ["i24-07-card-detail",                 `/cards/${CARD_PUBKEY}`,                               "consumer"],
  ["i24-08-cards-new",                   "/cards/new",                                          "consumer"],
  ["i24-09-pacts",                       "/pacts",                                              "consumer"],
  ["i24-10-wishes",                      "/wishes",                                             "consumer"],
  ["i24-11-allowances",                  "/allowances",                                         "consumer"],
  ["i24-12-capabilities",                "/capabilities",                                       "consumer"],
  ["i24-13-groups",                      "/groups",                                             "consumer"],
  ["i24-14-group-detail",                `/g/${GROUP_ID}`,                                      "consumer"],
  ["i24-15-split-bill",                  "/split-bill",                                         "consumer"],
  ["i24-16-watch",                       "/watch",                                              "consumer"],
  ["i24-17-audit",                       "/audit",                                              "consumer"],
  ["i24-18-verify",                      "/verify",                                             "consumer"],
  ["i24-19-verify-hash",                 `/verify/${RECEIPT_HASH}`,                             "consumer"],
  ["i24-20-onboarding",                  "/onboarding",                                         "consumer"],
  ["i24-21-settings",                    "/settings",                                           "consumer"],
  ["i24-22-activity",                    "/activity",                                           "consumer"],
  ["i24-23-notifications",               "/notifications",                                      "consumer"],
  ["i24-24-profile",                     "/profile",                                            "consumer"],
  ["i24-25-import",                      "/import",                                             "consumer"],
  ["i24-26-feed",                        "/feed",                                               "consumer"],
  ["i24-27-leaderboard",                 "/leaderboard",                                        "consumer"],
  ["i24-28-changelog",                   "/changelog",                                          "consumer"],
  ["i24-29-help",                        "/help",                                               "consumer"],
  ["i24-30-privacy",                     "/privacy",                                            "consumer"],
  ["i24-31-security",                    "/security",                                           "consumer"],
  ["i24-32-brand",                       "/brand",                                              "consumer"],
  ["i24-33-control-center",              "/control-center",                                     "consumer"],
  // Public profile / merchant
  ["i24-34-at-handle",                   `/at/${HANDLE}`,                                       "public"],
  ["i24-35-at-pubkey",                   `/at/${PUBKEY}`,                                       "public"],
  ["i24-36-merchant-home",               `/m/${HANDLE}`,                                        "merchant"],
  ["i24-37-merchant-manage",             `/m/${HANDLE}/manage`,                                 "merchant"],
  ["i24-38-merchant-disputes",           `/m/${HANDLE}/disputes`,                               "merchant"],
  ["i24-39-merchant-webhook",            `/m/${HANDLE}/webhook`,                                "merchant"],
  ["i24-40-merchant-capabilities",       `/m/${HANDLE}/capabilities`,                           "merchant"],
  ["i24-41-merchant-analytics",          `/m/${HANDLE}/analytics`,                              "merchant"],
  ["i24-42-merchant-qr",                 `/m/${HANDLE}/qr`,                                     "merchant"],
  ["i24-43-merchant-verify",             `/m/${HANDLE}/verify`,                                 "merchant"],
  // Agent surfaces
  ["i24-44-agents",                      "/agents",                                             "agent"],
  ["i24-45-agents-new",                  "/agents/new",                                         "agent"],
  ["i24-46-agents-streaming",            "/agents/streaming",                                   "agent"],
  ["i24-47-agents-templates",            "/agents/templates",                                   "agent"],
  ["i24-48-agents-templates-research",   "/agents/templates/research",                          "agent"],
  ["i24-49-agents-templates-new",        "/agents/templates/new",                               "agent"],
  ["i24-50-agents-collab",               "/agents/collab",                                      "agent"],
  // Developer / docs
  ["i24-51-docs",                        "/docs",                                               "developer"],
  ["i24-52-docs-mcp",                    "/docs/mcp",                                           "developer"],
  ["i24-53-docs-pay",                    "/docs/pay-component",                                 "developer"],
  ["i24-54-docs-verify",                 "/docs/verify-component",                              "developer"],
  ["i24-55-docs-webhooks",               "/docs/webhooks",                                      "developer"],
  // Admin / operator
  ["i24-56-admin-cron",                  "/admin/cron",                                         "operator"],
  ["i24-57-admin-health",                "/admin/health",                                       "operator"],
  ["i24-58-admin-federation",            "/admin/federation/origins",                           "operator"],
  ["i24-59-admin-preflight",             "/admin/preflight",                                    "operator"],
  // Embed + Blink
  ["i24-60-embed-pay",                   `/embed/pay?merchant=${PUBKEY}&amount=0.01`,           "embed"],
  ["i24-61-embed-merchant-pay",          `/embed/${HANDLE}/pay`,                                "embed"],
  ["i24-62-pay-widget",                  "/pay/widget",                                         "embed"],
  ["i24-63-blink-research",              "/blink/research",                                     "embed"],
  ["i24-64-pay-root",                    "/pay",                                                "embed"],
  // Capabilities discover + leaderboard nested
  ["i24-65-capabilities-discover",       "/capabilities/discover",                              "consumer"],
  ["i24-66-ledger",                      "/ledger",                                             "consumer"],
];

test.describe("iter24 final UI sweep — every major route in real Phantom", () => {
  test.setTimeout(40 * 60 * 1000);

  test("capture every public route + detect render failures", async () => {
    writeFileSync(REPORT, `# iter24 ${new Date().toISOString()}\n\nTotal routes: ${ROUTES.length}\n\n`);
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

    const results: Array<{ name: string; path: string; status: "ok" | "404" | "5xx" | "error" | "empty"; detail?: string }> = [];

    for (const [name, path, category] of ROUTES) {
      const t0 = Date.now();
      try {
        const resp = await page.goto(`${PRODUCTION}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        const httpStatus = resp?.status() ?? 0;
        await sleep(2_500);

        // Detect render-error states from body text
        const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500)).catch(() => "");
        let status: "ok" | "404" | "5xx" | "error" | "empty" = "ok";
        let detail = "";
        if (httpStatus === 404 || /404|not.found|page.not.found/i.test(bodyText)) {
          status = "404";
          detail = bodyText.slice(0, 80).replace(/\s+/g, " ");
        } else if (httpStatus >= 500) {
          status = "5xx";
          detail = `HTTP ${httpStatus}`;
        } else if (/Application error|something went wrong|unexpected error|hydration failed/i.test(bodyText)) {
          status = "error";
          detail = bodyText.slice(0, 80).replace(/\s+/g, " ");
        } else if (bodyText.trim().length < 20) {
          status = "empty";
          detail = `body=${bodyText.length}`;
        }

        await page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: true }).catch(() => {});
        const dur = ((Date.now() - t0) / 1000).toFixed(1);
        const icon = status === "ok" ? "✓" : status === "404" ? "✗" : status === "5xx" ? "✗" : "⚠";
        log(`${icon} ${name.padEnd(40)} ${path.padEnd(50)} [${status}] (${dur}s) ${detail}`);
        results.push({ name, path, status, detail });
      } catch (e) {
        const dur = ((Date.now() - t0) / 1000).toFixed(1);
        const firstLine = (e as Error).message.split("\n")[0] ?? "";
        log(`✗ ${name.padEnd(40)} ${path.padEnd(50)} [error] (${dur}s) ${firstLine.slice(0, 80)}`);
        results.push({ name, path, status: "error", detail: firstLine.slice(0, 80) });
      }
    }

    // Final summary
    const ok = results.filter((r) => r.status === "ok").length;
    const broken = results.filter((r) => r.status !== "ok");
    log(`\n=== SUMMARY ===\n${ok}/${results.length} routes rendered cleanly`);
    for (const b of broken) {
      log(`  [${b.status}] ${b.name} (${b.path}) — ${b.detail ?? ""}`);
    }

    await ctx.close();
  });
});
