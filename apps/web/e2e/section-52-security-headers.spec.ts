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
  });

  test("/dashboard includes security headers", async ({ page }) => {
    const r = await page.request.get("/dashboard", { timeout: 15000 });
    const h = r.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
  });
});
