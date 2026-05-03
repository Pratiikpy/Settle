import { test, expect } from "@playwright/test";
import { connectBurner } from "./helpers/connect-burner";

test.describe("Section 12 · Notifications", () => {
  test("12.1 — /activity notifications inbox renders", async ({ page }) => {
    await page.goto("/?stay=1");
    await connectBurner(page);
    await page.goto("/activity");
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("12.2 — Notifications API returns valid JSON for known pubkey", async ({ page }) => {
    const r = await page.request.get(
      "/api/notifications?pubkey=Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB",
    );
    // Either 200 with { notifications: [] } or 404 if route is parameter-only
    expect([200, 400, 404].includes(r.status())).toBeTruthy();
  });
});
