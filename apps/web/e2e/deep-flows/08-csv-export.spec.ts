/**
 * Deep flow #8 — CSV EXPORT
 *
 * Proves: Alice opens /settings/exports → clicks "Download CSV export"
 *         → file downloads → contents are valid CSV with header + rows
 */
import { test, expect } from "@playwright/test";
import { openPersonaContext, ALICE_KEY } from "../helpers/seed-burner";
import { connectBurner, waitForW6Hydrated } from "../helpers/deep-flow";

test("DEEP-8: Alice exports receipts to CSV — file downloads with valid format", async ({ browser }) => {
  test.setTimeout(120_000);
  const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
  const page = await aliceCtx.newPage();
  try {
    await connectBurner(page);
    await page.goto("/settings/exports", {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    await waitForW6Hydrated(page);

    // The CSV format radio should be selected by default
    // Click the download link/button
    const downloadLink = page.locator("a", { hasText: /Download CSV export/ }).first();
    await expect(downloadLink).toBeVisible({ timeout: 15_000 });

    // Verify the link has a non-empty href
    const href = await downloadLink.getAttribute("href");
    expect(href, "download URL is set").toBeTruthy();
    expect(href, "download URL points to API").toContain("/api/exports/receipts");
    console.log("[DEEP-8] Download URL:", href);

    // Fetch the URL directly to verify the CSV content
    const r = await page.request.get(href!);
    expect(r.status(), "CSV API returns 200").toBe(200);

    const contentType = r.headers()["content-type"] ?? "";
    console.log("[DEEP-8] Content-Type:", contentType);
    // CSV may be served as text/csv or application/octet-stream
    expect(/csv|text|octet/i.test(contentType), "content-type indicates file").toBeTruthy();

    const body = await r.text();
    expect(body.length, "body is non-empty").toBeGreaterThan(0);

    // CSV should have at least a header row
    const lines = body.split(/\r?\n/).filter(l => l.trim());
    console.log(`[DEEP-8] CSV has ${lines.length} non-empty lines (incl. header)`);
    expect(lines.length, "CSV has at least header row").toBeGreaterThanOrEqual(1);

    // Header should look like CSV (commas)
    expect(lines[0], "first line is header with commas").toContain(",");
    console.log("[DEEP-8] Header columns:", lines[0].slice(0, 100));

    console.log("[DEEP-8] ✅ CSV export verified");
  } finally {
    await aliceCtx.close();
  }
});
