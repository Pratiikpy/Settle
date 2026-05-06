/**
 * Live audit of https://use-settle.vercel.app/
 * Tests every route at 375x812 (mobile) and 1440x900 (desktop).
 * Captures full-page screenshots, console errors, and UX issues.
 */

import { test, expect, Page, ConsoleMessage } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://use-settle.vercel.app";
const SCREENSHOT_DIR = path.join(__dirname, "audit-screenshots", "live");

const MOBILE = { width: 375, height: 812, name: "mobile" };
const DESKTOP = { width: 1440, height: 900, name: "desktop" };

const ROUTES = [
  "/",
  "/dashboard",
  "/send",
  "/receive",
  "/ledger",
  "/groups",
  "/cards",
  "/cards/new",
  "/leaderboard",
  "/agents",
  "/agents/streaming",
  "/start",
  "/start/consumer",
  "/start/business",
  "/start/agent-crosschain",
  "/watch",
  "/watch-crosschain",
  "/settings",
  "/nonexistent-404-check",
];

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const consoleErrors: Record<string, string[]> = {};
const findings: Array<{
  route: string;
  viewport: string;
  severity: string;
  issue: string;
  detail: string;
}> = [];

function slugify(route: string) {
  return route.replace(/\//g, "_").replace(/^_/, "") || "root";
}

async function auditPage(
  page: Page,
  route: string,
  viewport: { width: number; height: number; name: string }
) {
  const url = `${BASE_URL}${route}`;
  const key = `${viewport.name}::${route}`;
  const errors: string[] = [];

  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  // Collect console errors
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      errors.push(`[console error] ${msg.text()}`);
    }
    if (msg.type() === "warning" && msg.text().includes("Warning:")) {
      errors.push(`[react warning] ${msg.text().slice(0, 200)}`);
    }
  });

  page.on("pageerror", (err: Error) => {
    errors.push(`[page error] ${err.message}`);
  });

  let finalUrl = url;
  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait a bit for any JS hydration/animations
    await page.waitForTimeout(2000);

    finalUrl = page.url();
    const status = response?.status() ?? 0;

    // Check for redirect
    if (finalUrl !== url && !finalUrl.startsWith(BASE_URL + route)) {
      findings.push({
        route,
        viewport: viewport.name,
        severity: "MEDIUM",
        issue: "Redirect",
        detail: `${url} redirected to ${finalUrl}`,
      });
    }

    // Check HTTP status
    if (status === 404) {
      findings.push({
        route,
        viewport: viewport.name,
        severity: route === "/nonexistent-404-check" ? "LOW" : "CRITICAL",
        issue: `HTTP ${status}`,
        detail: `Route returns ${status}`,
      });
    } else if (status >= 500) {
      findings.push({
        route,
        viewport: viewport.name,
        severity: "CRITICAL",
        issue: `HTTP ${status} Server Error`,
        detail: `Route returns ${status}`,
      });
    }

  } catch (err) {
    findings.push({
      route,
      viewport: viewport.name,
      severity: "CRITICAL",
      issue: "Navigation failed",
      detail: String(err),
    });
  }

  // Take full-page screenshot
  const screenshotPath = path.join(
    SCREENSHOT_DIR,
    `${viewport.name}_${slugify(route)}.png`
  );
  try {
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
      timeout: 15000,
    });
  } catch (_e) {
    // screenshot failed — non-fatal
  }

  consoleErrors[key] = errors;

  // --- UX Checks ---

  // 1. Check for "coming soon" toasts or labels
  const pageContent = await page.content();
  const lowerContent = pageContent.toLowerCase();
  if (lowerContent.includes("coming soon")) {
    findings.push({
      route,
      viewport: viewport.name,
      severity: "HIGH",
      issue: "Coming soon placeholder",
      detail: 'Page contains "coming soon" text',
    });
  }
  if (lowerContent.includes("not available") || lowerContent.includes("feature not available")) {
    findings.push({
      route,
      viewport: viewport.name,
      severity: "HIGH",
      issue: "Feature not available placeholder",
      detail: 'Page contains "not available" text',
    });
  }

  // 2. Check page title
  const title = await page.title();
  if (!title || title === "untitled" || title === "") {
    findings.push({
      route,
      viewport: viewport.name,
      severity: "MEDIUM",
      issue: "Missing page title",
      detail: `Title is: "${title}"`,
    });
  }

  // 3. Check for horizontal scroll (overflow-x)
  try {
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });
    if (hasHorizontalScroll) {
      const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
      findings.push({
        route,
        viewport: viewport.name,
        severity: "HIGH",
        issue: "Horizontal overflow / scroll",
        detail: `body.scrollWidth (${scrollWidth}) > viewport (${viewport.width})`,
      });
    }
  } catch (_e) {}

  // 4. Check for broken images
  try {
    const brokenImages = await page.evaluate(() => {
      const imgs = Array.from(document.images);
      return imgs
        .filter((img) => !img.complete || img.naturalWidth === 0)
        .map((img) => img.src);
    });
    if (brokenImages.length > 0) {
      findings.push({
        route,
        viewport: viewport.name,
        severity: "MEDIUM",
        issue: "Broken images",
        detail: `Broken: ${brokenImages.slice(0, 3).join(", ")}`,
      });
    }
  } catch (_e) {}

  // 5. Check for small tap targets on mobile
  if (viewport.name === "mobile") {
    try {
      const smallTargets = await page.evaluate(() => {
        const interactives = Array.from(
          document.querySelectorAll("button, a, [role='button'], input[type='submit']")
        );
        return interactives
          .filter((el) => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              (rect.width < 44 || rect.height < 44)
            );
          })
          .slice(0, 5)
          .map((el) => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            return `${(el as HTMLElement).textContent?.trim().slice(0, 30) || el.tagName} (${Math.round(rect.width)}x${Math.round(rect.height)})`;
          });
      });
      if (smallTargets.length > 0) {
        findings.push({
          route,
          viewport: viewport.name,
          severity: "MEDIUM",
          issue: "Small tap targets (<44px)",
          detail: `Found: ${smallTargets.join("; ")}`,
        });
      }
    } catch (_e) {}
  }

  // 6. Check for empty/blank page (no meaningful content)
  try {
    const bodyText = await page.evaluate(() => document.body.innerText.trim());
    if (bodyText.length < 50) {
      findings.push({
        route,
        viewport: viewport.name,
        severity: "CRITICAL",
        issue: "Page appears blank or near-empty",
        detail: `Body text length: ${bodyText.length} chars. Content: "${bodyText.slice(0, 100)}"`,
      });
    }
  } catch (_e) {}

  // 7. Check for infinite spinners (loading indicators still present after 3s)
  try {
    const spinnerSelectors = [
      '[class*="spinner"]',
      '[class*="loading"]',
      '[class*="skeleton"]',
      '[aria-busy="true"]',
      '[class*="animate-spin"]',
    ];
    for (const sel of spinnerSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        // check if still visible after another second
        await page.waitForTimeout(1000);
        const countAfter = await page.locator(sel).count();
        if (countAfter > 0) {
          const texts = await page.locator(sel).allTextContents();
          findings.push({
            route,
            viewport: viewport.name,
            severity: "HIGH",
            issue: "Persistent loading/spinner state",
            detail: `Selector "${sel}" still visible after 3s wait. Count: ${countAfter}. Text: ${texts.slice(0, 3).join(", ")}`,
          });
          break;
        }
      }
    }
  } catch (_e) {}

  // 8. Check for "undefined" or "null" text in the page
  try {
    const hasUndefined = await page.evaluate(() => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT
      );
      let node;
      const badTexts: string[] = [];
      while ((node = walker.nextNode())) {
        const t = node.textContent?.trim() ?? "";
        if (t === "undefined" || t === "null" || t === "[object Object]") {
          badTexts.push(t);
        }
      }
      return badTexts.slice(0, 5);
    });
    if (hasUndefined.length > 0) {
      findings.push({
        route,
        viewport: viewport.name,
        severity: "HIGH",
        issue: "Raw undefined/null/[object Object] rendered in DOM",
        detail: `Found: ${hasUndefined.join(", ")}`,
      });
    }
  } catch (_e) {}

  // 9. Check navigation links (only desktop pass to avoid duplication)
  if (viewport.name === "desktop") {
    try {
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("a[href]"))
          .map((a) => (a as HTMLAnchorElement).href)
          .filter((h) => h && !h.startsWith("mailto:") && !h.startsWith("javascript:"))
          .slice(0, 20);
      });
      // Check for obviously dead hrefs
      const deadLinks = links.filter(
        (l) => l.endsWith("#") || l === "javascript:void(0)"
      );
      if (deadLinks.length > 0) {
        findings.push({
          route,
          viewport: viewport.name,
          severity: "MEDIUM",
          issue: "Dead/hash-only links",
          detail: `Found: ${deadLinks.slice(0, 5).join(", ")}`,
        });
      }
    } catch (_e) {}
  }

  // 10. Check for text overflow / clipped text
  try {
    const clipped = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("h1, h2, h3, p, span, button"));
      return els
        .filter((el) => {
          const e = el as HTMLElement;
          return e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0;
        })
        .slice(0, 3)
        .map((el) => {
          const e = el as HTMLElement;
          return `${el.tagName}: "${e.textContent?.trim().slice(0, 40)}" (scroll:${e.scrollWidth} client:${e.clientWidth})`;
        });
    });
    if (clipped.length > 0) {
      findings.push({
        route,
        viewport: viewport.name,
        severity: "MEDIUM",
        issue: "Text overflow / clipped text",
        detail: `${clipped.join("; ")}`,
      });
    }
  } catch (_e) {}

  return { errors, finalUrl };
}

// ---- Test suite ----

for (const viewport of [MOBILE, DESKTOP]) {
  test.describe(`Audit @ ${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of ROUTES) {
      test(`${route}`, async ({ page }) => {
        const { errors } = await auditPage(page, route, viewport);

        // Log console errors as soft failures
        if (errors.length > 0) {
          findings.push({
            route,
            viewport: viewport.name,
            severity: "HIGH",
            issue: "Console/page errors",
            detail: errors.slice(0, 5).join(" | "),
          });
        }

        // The test itself just needs to not throw — we collect findings separately
        // Soft assertion: page should not be completely blank
        const bodyText = await page.evaluate(() =>
          document.body.innerText.trim()
        ).catch(() => "");
        expect(bodyText.length).toBeGreaterThan(0);
      });
    }

    // Extra: try clicking a leaderboard row if present
    test(`/leaderboard - click first row`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${BASE_URL}/leaderboard`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      // Take screenshot before click
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${viewport.name}_leaderboard_before_click.png`),
        fullPage: true,
      });

      // Try to find and click a row
      const rowSelectors = [
        "table tbody tr",
        "[class*='row']",
        "[class*='leaderboard'] li",
        "[class*='entry']",
        "tbody tr",
      ];

      let clicked = false;
      for (const sel of rowSelectors) {
        const rows = page.locator(sel);
        const count = await rows.count();
        if (count > 0) {
          const row = rows.first();
          const href = await row.evaluate((el) =>
            el.tagName === "A"
              ? (el as HTMLAnchorElement).href
              : el.querySelector("a")?.href ?? null
          );

          if (href) {
            await row.click();
            await page.waitForTimeout(1500);
            const newUrl = page.url();

            await page.screenshot({
              path: path.join(SCREENSHOT_DIR, `${viewport.name}_leaderboard_detail.png`),
              fullPage: true,
            });

            if (newUrl === `${BASE_URL}/leaderboard`) {
              findings.push({
                route: "/leaderboard",
                viewport: viewport.name,
                severity: "HIGH",
                issue: "Leaderboard row click does not navigate",
                detail: `Clicked row with href ${href}, URL unchanged at ${newUrl}`,
              });
            }
          } else {
            findings.push({
              route: "/leaderboard",
              viewport: viewport.name,
              severity: "MEDIUM",
              issue: "Leaderboard rows have no navigation link",
              detail: `Rows found (${count}) but no <a> href detected`,
            });
          }
          clicked = true;
          break;
        }
      }

      if (!clicked) {
        findings.push({
          route: "/leaderboard",
          viewport: viewport.name,
          severity: "MEDIUM",
          issue: "Leaderboard empty — no rows found",
          detail: "No table rows or list items detected after 2s",
        });
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${viewport.name}_leaderboard_empty.png`),
          fullPage: true,
        });
      }
    });

    // Extra: /send — check form fields
    test(`/send - form field audit`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${BASE_URL}/send`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${viewport.name}_send_form.png`),
        fullPage: true,
      });

      // Check if there is an amount input
      const inputs = await page.locator("input").count();
      if (inputs === 0) {
        findings.push({
          route: "/send",
          viewport: viewport.name,
          severity: "CRITICAL",
          issue: "No input fields on /send (wallet not connected?)",
          detail: "0 <input> elements found — may need wallet connection first",
        });
      }

      // Check for connect wallet CTA
      const pageText = (await page.content()).toLowerCase();
      if (
        pageText.includes("connect wallet") ||
        pageText.includes("connect your wallet")
      ) {
        findings.push({
          route: "/send",
          viewport: viewport.name,
          severity: "MEDIUM",
          issue: "Send page gates on wallet connection",
          detail: "Wallet connect prompt shown — send form not accessible without wallet",
        });
      }

      // Check CTA button reachability on mobile
      if (viewport.name === "mobile") {
        const buttons = page.locator("button");
        const count = await buttons.count();
        for (let i = 0; i < Math.min(count, 10); i++) {
          const btn = buttons.nth(i);
          const box = await btn.boundingBox();
          if (box && box.height < 44 && box.width > 0) {
            const text = await btn.textContent();
            findings.push({
              route: "/send",
              viewport: viewport.name,
              severity: "MEDIUM",
              issue: `Button tap target too small: "${text?.trim().slice(0, 30)}" (${Math.round(box.width)}x${Math.round(box.height)}px)`,
              detail: `Min 44px recommended, got ${Math.round(box.height)}px height`,
            });
          }
        }
      }
    });

    // Extra: /settings
    test(`/settings - sections audit`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${BASE_URL}/settings`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${viewport.name}_settings_scroll.png`),
        fullPage: true,
      });

      const bodyText = await page.evaluate(() => document.body.innerText);
      // Check for save/update buttons
      if (!bodyText.toLowerCase().includes("save") && !bodyText.toLowerCase().includes("update")) {
        findings.push({
          route: "/settings",
          viewport: viewport.name,
          severity: "MEDIUM",
          issue: "No save/update action found on settings page",
          detail: "Settings page may be read-only or missing action buttons",
        });
      }
    });

    // Extra: /dashboard
    test(`/dashboard - empty state audit`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${BASE_URL}/dashboard`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(3000);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${viewport.name}_dashboard_full.png`),
        fullPage: true,
      });

      // Check for balance display
      const pageText = await page.evaluate(() => document.body.innerText);
      const hasBalance = /\$|SOL|USDC|balance/i.test(pageText);
      if (!hasBalance) {
        findings.push({
          route: "/dashboard",
          viewport: viewport.name,
          severity: "MEDIUM",
          issue: "No balance or financial data visible on dashboard",
          detail: "No $ / SOL / USDC / 'balance' found in page text — may be empty state or hidden behind wallet connect",
        });
      }

      // Check nav bar is visible on mobile
      if (viewport.name === "mobile") {
        const navSelectors = [
          "nav",
          "[class*='bottom']",
          "[class*='tab-bar']",
          "[class*='navbar']",
          "[role='navigation']",
        ];
        let navFound = false;
        for (const sel of navSelectors) {
          const count = await page.locator(sel).count();
          if (count > 0) {
            navFound = true;
            // Check if nav overlaps content
            const navBox = await page.locator(sel).first().boundingBox();
            if (navBox) {
              const viewportHeight = viewport.height;
              if (navBox.y + navBox.height > viewportHeight - 10) {
                // Nav is at bottom — check if any CTA is hidden behind it
                findings.push({
                  route: "/dashboard",
                  viewport: viewport.name,
                  severity: "MEDIUM",
                  issue: "Bottom nav may overlap page content",
                  detail: `Nav at y=${Math.round(navBox.y)}, height=${Math.round(navBox.height)}. Check last CTA is not hidden.`,
                });
              }
            }
            break;
          }
        }
        if (!navFound) {
          findings.push({
            route: "/dashboard",
            viewport: viewport.name,
            severity: "HIGH",
            issue: "No navigation bar found on mobile dashboard",
            detail: "Expected bottom tab bar or nav on mobile viewport",
          });
        }
      }
    });
  });
}

// After all tests, write findings to a JSON file for report generation
test.afterAll(async () => {
  const reportPath = path.join(SCREENSHOT_DIR, "findings.json");
  fs.writeFileSync(reportPath, JSON.stringify({ findings, consoleErrors }, null, 2));
  console.log(`\n\n=== FINDINGS SUMMARY (${findings.length} total) ===`);
  const grouped: Record<string, typeof findings> = {};
  for (const f of findings) {
    if (!grouped[f.severity]) grouped[f.severity] = [];
    grouped[f.severity]!.push(f);
  }
  for (const sev of ["CRITICAL", "HIGH", "MEDIUM", "LOW"]) {
    if (grouped[sev]?.length) {
      console.log(`\n--- ${sev} (${grouped[sev].length}) ---`);
      for (const f of grouped[sev]) {
        console.log(`  [${f.viewport}] ${f.route}: ${f.issue} — ${f.detail}`);
      }
    }
  }
});
