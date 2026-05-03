import { test, expect } from "@playwright/test";

test.describe("Section 26 · API validation paths", () => {
  test("POST /api/swap/quote-and-build empty body → 400", async ({ page }) => {
    const r = await page.request.post("/api/swap/quote-and-build", {
      data: {},
      timeout: 15000,
    });
    expect(r.status()).toBe(400);
  });

  test("POST /api/intent/parse empty body → 400", async ({ page }) => {
    const r = await page.request.post("/api/intent/parse", {
      data: {},
      timeout: 15000,
    });
    expect(r.status()).toBe(400);
  });

  test("POST /api/disputes/draft empty body → 400", async ({ page }) => {
    const r = await page.request.post("/api/disputes/draft", {
      data: {},
      timeout: 15000,
    });
    expect(r.status()).toBe(400);
  });

  test("POST /api/voice/transcribe wrong content-type → 415", async ({ page }) => {
    const r = await page.request.post("/api/voice/transcribe", {
      data: {},
      timeout: 15000,
    });
    expect(r.status()).toBe(415);
  });

  test("GET /api/cron/phase5-tick no auth → 401", async ({ page }) => {
    const r = await page.request.get("/api/cron/phase5-tick", { timeout: 10000 });
    expect(r.status()).toBe(401);
  });

  test("GET /api/admin/cron/recent no auth → 401", async ({ page }) => {
    const r = await page.request.get("/api/admin/cron/recent", { timeout: 10000 });
    expect(r.status()).toBe(401);
  });

  test("GET /api/at/[handle] for unknown handle → 404", async ({ page }) => {
    const r = await page.request.get("/api/at/nonexistent-handle-xyz", { timeout: 10000 });
    expect(r.status()).toBe(404);
  });

  test("GET /api/handles/lookup unknown → 404", async ({ page }) => {
    const r = await page.request.get(
      "/api/handles/lookup?handle=nonexistent-zzz",
      { timeout: 10000 },
    );
    expect(r.status()).toBe(404);
  });
});
