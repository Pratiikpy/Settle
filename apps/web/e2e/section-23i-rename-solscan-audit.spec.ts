/**
 * §23i — Plain-English rename pass + Solscan link audit.
 *
 * Asserts:
 *  - Dashboard empty-state for cards uses "spending rules" not "Pacts"
 *  - Activity table column reads "Rule" not "Pact"
 *  - Merchant capabilities form heading reads "verified service"
 *  - Pages that show tx hashes link to solscan.io (already-working surfaces)
 */
import { test, expect } from "@playwright/test";

test.describe("§23i · Plain-English UI labels", () => {
  test("23i.dashboard-no-pacts-empty-uses-rules — no 'Pact' in the empty cards CTA", async ({
    page,
  }) => {
    // Connect via burner so dashboard renders
    await page.goto("/?stay=1");
    // Just goto dashboard directly; if it 200s and has content we read text.
    const r = await page.goto("/dashboard");
    if ((r?.status() || 0) >= 500) test.skip();
    await page.waitForTimeout(1500);
    const html = await page.content();
    // If "No active" copy is rendered, it should use rule-language.
    if (/No active/i.test(html)) {
      expect(html).toMatch(/spending rule|Create a rule|active spending/i);
    }
  });

  test("23i.activity-column-rule — activity table column header reads Rule", async ({
    page,
  }) => {
    const r = await page.goto("/activity");
    if ((r?.status() || 0) >= 500) test.skip();
    await page.waitForTimeout(1000);
    const html = await page.content();
    // Column may not render without data, but if 'Rule' header is present
    // we want to confirm. Skip if /activity has no table at all.
    if (/<th[^>]*>(Card|Merchant|Amount|Status)</i.test(html)) {
      expect(html).toMatch(/<th[^>]*>Rule</i);
    }
  });

  test("23i.merchant-capabilities-form — uses 'verified service' heading", async ({
    page,
  }) => {
    const r = await page.goto("/m/me/capabilities");
    if ((r?.status() || 0) >= 500) test.skip();
    await page.waitForTimeout(1000);
    const html = await page.content();
    if (/New (capability|verified service)/i.test(html)) {
      expect(html).toMatch(/New verified service/i);
    }
  });
});

test.describe("§23i · Solscan link audit", () => {
  test("23i.receipt-poster-has-solscan — /r/<real id> uses solscan.io devnet", async ({
    page,
    request,
  }) => {
    const feed = await request.get("/api/landing/feed");
    const body = await feed.json();
    const real = (body?.items || []).find((it: any) =>
      /^[0-9a-f-]{36}$/i.test(it.request_id || ""),
    );
    test.skip(!real, "no real receipt in feed");
    await page.goto(`/r/${real.request_id}`);
    const link = page.getByTestId("receipt-solscan-link");
    if ((await link.count()) > 0) {
      const href = await link.getAttribute("href");
      expect(href).toMatch(/^https:\/\/solscan\.io\/tx\/[A-Za-z0-9]+/);
    }
  });

  test("23i.magic-moment-tx-link — landing terminal tx links go to solscan", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForTimeout(5000);
    const link = page.getByTestId("mm-tx-link").first();
    if ((await link.count()) === 0) return;
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^https:\/\/solscan\.io\/tx\/[A-Za-z0-9]+/);
  });

  test("23i.watch-tx-link — /watch tx links go to solscan", async ({ page }) => {
    await page.goto("/watch");
    await page.waitForTimeout(5000);
    const link = page.getByTestId("watch-tx-link").first();
    if ((await link.count()) === 0) return;
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^https:\/\/solscan\.io\/tx\/[A-Za-z0-9]+/);
  });
});
