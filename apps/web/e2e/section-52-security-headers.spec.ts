import { test, expect } from "@playwright/test";

test.describe("Section 52 · Security headers (live)", () => {
  test("response includes XCTO/XFO/Referrer-Policy/Permissions-Policy", async ({ page }) => {
    const r = await page.request.get("/", { timeout: 15000 });
    expect(r.status()).toBe(200);
    const h = r.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("camera=()");
    // HSTS — added pass 17 (force HTTPS for 1y in production)
    expect(h["strict-transport-security"]).toMatch(/max-age=\d{6,}/);
    expect(h["strict-transport-security"]).toContain("includeSubDomains");
    // COOP — same-origin-allow-popups lets wallet popups work
    expect(h["cross-origin-opener-policy"]).toBe("same-origin-allow-popups");
  });

  test("/dashboard includes security headers", async ({ page }) => {
    const r = await page.request.get("/dashboard", { timeout: 15000 });
    const h = r.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["strict-transport-security"]).toContain("max-age=");
  });
});
