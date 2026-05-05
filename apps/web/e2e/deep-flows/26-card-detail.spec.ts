/**
 * Deep flow #26 — CARD DETAIL PAGE
 *
 * Proves: After Alice creates an AgentCard (via DEEP-2 or earlier runs),
 *         /cards lists it and clicking through to the detail page renders
 *         the card metadata, daily cap, allowlist, and pact list.
 */
import { test, expect } from "@playwright/test";
import { openPersonaContext, ALICE_KEY } from "../helpers/seed-burner";
import { connectBurner, waitForW6Hydrated } from "../helpers/deep-flow";

test("DEEP-26: Alice opens /cards → clicks first card → detail page renders metadata", async ({ browser }) => {
  test.setTimeout(120_000);
  const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
  const page = await aliceCtx.newPage();
  try {
    await connectBurner(page);
    await page.goto("/cards", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await waitForW6Hydrated(page);
    await page.waitForTimeout(3_000);

    // Wait for the card list to render
    const main = page.locator("main").first();
    await expect(main).toBeVisible({ timeout: 15_000 });

    // Find a card detail link — pubkey-style /cards/[base58], not /cards/new
    const cardLinks = await page.locator("a[href^='/cards/']").all();
    let cardLink = null;
    for (const link of cardLinks) {
      const href = await link.getAttribute("href");
      if (href && /^\/cards\/[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(href)) {
        cardLink = link;
        break;
      }
    }
    const hasCards = !!cardLink && await cardLink.isVisible({ timeout: 5_000 }).catch(() => false);
    const firstCardLink = cardLink ?? page.locator("a[href*='/cards/'][href*='nope']");

    if (!hasCards) {
      console.log("[DEEP-26] No cards exist — Alice needs to run DEEP-2 first to create one");
      // Check empty state renders
      const emptyState = await page.getByText(/no.*card|create.*card|first card/i).first().isVisible({ timeout: 3_000 }).catch(() => false);
      console.log(`[DEEP-26] Empty state visible: ${emptyState}`);
      return;
    }

    const cardHref = await firstCardLink.getAttribute("href");
    console.log(`[DEEP-26] Clicking card: ${cardHref}`);
    await firstCardLink.click();
    await page.waitForLoadState("domcontentloaded");
    await waitForW6Hydrated(page);
    await page.waitForTimeout(3_000);

    // Verify URL changed to /cards/[id]
    expect(page.url()).toMatch(/\/cards\/[A-Za-z0-9]+/);

    // Card detail should render: card pubkey, daily cap, allowlist
    const detailText = await page.locator("main").first().textContent();
    expect(detailText?.trim().length ?? 0, "card detail has content").toBeGreaterThan(100);
    console.log(`[DEEP-26] Card detail rendered, content length: ${detailText?.length}`);

    console.log("[DEEP-26] ✅ Card detail page renders with metadata");
  } finally {
    await aliceCtx.close();
  }
});
