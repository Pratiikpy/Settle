/**
 * §23f — Magic moment terminal + thesis on landing.
 *
 * Asserts the autoplay terminal renders, classifies the feed honestly
 * (real on-chain vs preview), animates lines, links real Solscan URLs
 * when on-chain data exists, and the thesis strip is visible.
 *
 * Per testing rule: no fake. If the feed is empty we accept the
 * "preview · scenario" pill but still demand the terminal renders
 * something visible.
 */
import { test, expect } from "@playwright/test";

const APP = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

test.describe("§23f · Magic moment terminal", () => {
  test("23f.terminal-renders — autoplay terminal mounts on landing", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const term = page.getByTestId("magic-moment-terminal");
    await expect(term).toBeVisible({ timeout: 10_000 });
  });

  test("23f.terminal-pill-honest — pill says either 'live · on-chain' or 'preview · scenario'", async ({
    page,
  }) => {
    await page.goto("/");
    const pill = page.getByTestId("feed-mode-pill");
    await expect(pill).toBeVisible({ timeout: 10_000 });
    const text = (await pill.textContent()) ?? "";
    expect(text).toMatch(/live · on-chain|preview · scenario/);
  });

  test("23f.terminal-animates — at least one line appears within 4s", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForTimeout(4000);
    const allow = page.getByTestId("mm-line-allow");
    const deny = page.getByTestId("mm-line-deny");
    const allowCount = await allow.count();
    const denyCount = await deny.count();
    expect(allowCount + denyCount).toBeGreaterThan(0);
  });

  test("23f.terminal-tx-links-real-solscan — when live, links go to Solscan with cluster=devnet", async ({
    page,
  }) => {
    await page.goto("/");
    const pill = page.getByTestId("feed-mode-pill");
    await expect(pill).toBeVisible({ timeout: 10_000 });
    const isLive = ((await pill.textContent()) ?? "").includes("live");
    if (!isLive) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "feed in preview mode — no real tx links to assert",
      });
      return;
    }
    await page.waitForTimeout(5000);
    const link = page.getByTestId("mm-tx-link").first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^https:\/\/solscan\.io\/tx\/[A-Za-z0-9]+/);
    // Must include cluster query for non-mainnet, OR be mainnet (no query).
    expect(href).toMatch(/solscan\.io\/tx\/[A-Za-z0-9]+(\?cluster=(devnet|testnet))?$/);
  });

  test("23f.feed-api-shape — /api/landing/feed returns ok+items", async ({
    request,
  }) => {
    const r = await request.get(`${APP}/api/landing/feed`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
  });
});

test.describe("§23f · Thesis strip", () => {
  test("23f.thesis-renders — thesis strip mounts with stablecoin claim", async ({
    page,
  }) => {
    await page.goto("/");
    const t = page.getByTestId("thesis-strip");
    await expect(t).toBeVisible({ timeout: 10_000 });
    const text = (await t.textContent()) ?? "";
    expect(text).toMatch(/stablecoin/i);
    expect(text).toMatch(/revocable/i);
    expect(text).toMatch(/auditable/i);
  });
});
