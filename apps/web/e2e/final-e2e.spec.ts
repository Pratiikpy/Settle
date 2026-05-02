import { test, expect } from "@playwright/test";
import { connectBurner } from "./helpers/connect-burner";

/**
 * T11 — Final E2E orchestration. Single test walking the entire
 * happy path of a connected user. With burner having no funds the
 * actual on-chain confirms are covered by keypair harnesses; here we
 * verify the React-layer pipeline holds end-to-end as a user would
 * traverse it.
 */

test("T11 — full happy-path navigation with connected burner", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/?stay=1");
  await connectBurner(page);

  // Step 1: dashboard
  await page.goto("/dashboard");
  await expect(page.locator("main")).toBeVisible();

  // Step 2: cards list
  await page.goto("/cards");
  await expect(page.locator("main")).toBeVisible();

  // Step 3: cards/new (create surface)
  await page.goto("/cards/new");
  await expect(page.locator("main")).toBeVisible();

  // Step 4: wishes (schedule create surface)
  await page.goto("/wishes");
  await expect(page.locator("main")).toBeVisible();

  // Step 5: receipts (verify a known confirmed sig is browsable)
  // We use the receipt page generally (not a specific request_id since
  // that depends on indexer mirror; we verify the page route renders).
  await page.goto("/feed");
  await expect(page.locator("main")).toBeVisible();

  // Step 6: settings
  await page.goto("/settings");
  await expect(page.locator("main")).toBeVisible();

  // Step 7: simulate disconnect by reloading to /
  await page.goto("/?stay=1");
  // Re-connect and verify state is restored (burner regenerates a new
  // keypair so technically a "different" user, but the connect path
  // works).
  await connectBurner(page);
  await page.goto("/dashboard");
  await expect(page.locator("main")).toBeVisible();
});
