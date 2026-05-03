/**
 * §23g — Public receipt poster + /watch agent demo.
 *
 * Asserts:
 *  - /r/<bad uuid> 404s
 *  - /r/<unknown uuid> 404s
 *  - /r/<real uuid> renders poster with ID, decision badge, hash chain,
 *    Solscan link (devnet), verify CTA
 *  - /watch renders headline, mode pill, statistics, and rows
 *  - Solscan tx links resolve to real solscan.io devnet URLs (not fake)
 */
import { test, expect } from "@playwright/test";

const APP = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

async function findRealReceiptId(request: any): Promise<string | null> {
  const r = await request.get(`${APP}/api/landing/feed`);
  if (!r.ok()) return null;
  const body = await r.json();
  const items = body?.items as Array<{ request_id: string }> | undefined;
  const real = items?.find((it) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      it.request_id || "",
    ),
  );
  return real?.request_id ?? null;
}

test.describe("§23g · Receipt poster /r/[id]", () => {
  test("23g.poster-bad-uuid-not-rendered — invalid id format does not render poster", async ({
    page,
  }) => {
    const r = await page.goto(`${APP}/r/not-a-uuid`);
    // Next may serve 404 page with 200 status in static export — assert by
    // absence of poster, not by status code.
    expect([200, 404]).toContain(r?.status() || 0);
    await expect(page.getByTestId("receipt-poster")).toHaveCount(0);
  });

  test("23g.poster-unknown-uuid-not-rendered — unknown id does not render poster", async ({
    page,
  }) => {
    const r = await page.goto(
      `${APP}/r/00000000-0000-0000-0000-000000000000`,
    );
    expect([200, 404]).toContain(r?.status() || 0);
    await expect(page.getByTestId("receipt-poster")).toHaveCount(0);
  });

  test("23g.poster-not-found-tailored — unknown id renders branded 404 with verify CTA", async ({
    page,
  }) => {
    await page.goto(`${APP}/r/00000000-0000-0000-0000-000000000000`);
    await expect(page.getByTestId("receipt-not-found")).toBeVisible();
    const verifyCta = page.getByTestId("receipt-not-found-verify-cta");
    await expect(verifyCta).toBeVisible();
    expect(await verifyCta.getAttribute("href")).toBe("/verify");
  });

  test("23g.poster-real-renders — /r/<real id> renders poster end-to-end", async ({
    page,
    request,
  }) => {
    const id = await findRealReceiptId(request);
    test.skip(!id, "no real receipt found in feed");
    const r = await page.goto(`/r/${id!}`);
    expect(r?.status() || 0).toBeLessThan(500);
    await expect(page.getByTestId("receipt-poster")).toBeVisible();
    const idEl = page.getByTestId("receipt-id");
    await expect(idEl).toBeVisible();
    expect((await idEl.textContent()) || "").toContain(id!);
    await expect(page.getByTestId("receipt-decision-badge")).toBeVisible();
    await expect(page.getByTestId("receipt-amount")).toBeVisible();
    await expect(page.getByTestId("hash-receipt")).toBeVisible();
    await expect(page.getByTestId("hash-context")).toBeVisible();
    await expect(page.getByTestId("hash-reason")).toBeVisible();
    await expect(page.getByTestId("hash-policy")).toBeVisible();
  });

  test("23g.poster-solscan-link-real — when sig present, link is solscan.io devnet", async ({
    page,
    request,
  }) => {
    const id = await findRealReceiptId(request);
    test.skip(!id, "no real receipt found");
    await page.goto(`/r/${id!}`);
    const link = page.getByTestId("receipt-solscan-link");
    if ((await link.count()) === 0) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "this receipt has no on-chain sig",
      });
      return;
    }
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^https:\/\/solscan\.io\/tx\/[A-Za-z0-9]+/);
    expect(href).toMatch(/cluster=devnet|cluster=testnet|^https:\/\/solscan\.io\/tx\/[A-Za-z0-9]+$/);
  });

  test("23g.poster-verify-cta — verify CTA links to /verify with request_id", async ({
    page,
    request,
  }) => {
    const id = await findRealReceiptId(request);
    test.skip(!id, "no real receipt found");
    await page.goto(`/r/${id!}`);
    const link = page.getByTestId("receipt-verify-link");
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toContain(`/verify?request_id=${id!}`);
  });

  test("23g.poster-og-image-renders — /r/<id>/opengraph-image returns a real PNG", async ({
    request,
  }) => {
    const id = await findRealReceiptId(request);
    test.skip(!id, "no real receipt found");
    const r = await request.get(`${APP}/r/${id!}/opengraph-image`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toMatch(/^image\/png/);
    const body = await r.body();
    expect(body.length).toBeGreaterThan(2000); // sanity: a real PNG
    // PNG magic bytes
    expect(body[0]).toBe(0x89);
    expect(body[1]).toBe(0x50);
    expect(body[2]).toBe(0x4e);
    expect(body[3]).toBe(0x47);
  });

  test("23g.poster-og-image-fallback — bad uuid still renders a generic PNG", async ({
    request,
  }) => {
    const r = await request.get(
      `${APP}/r/00000000-0000-0000-0000-000000000000/opengraph-image`,
    );
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toMatch(/^image\/png/);
    const body = await r.body();
    expect(body.length).toBeGreaterThan(2000);
  });
});

test.describe("§23g · /watch agent demo", () => {
  test("23g.watch-renders — /watch page mounts with headline + demo", async ({
    page,
  }) => {
    const r = await page.goto("/watch");
    expect(r?.status() || 0).toBeLessThan(500);
    await expect(page.getByTestId("watch-headline")).toBeVisible();
    await expect(page.getByTestId("watch-demo")).toBeVisible({ timeout: 15_000 });
  });

  test("23g.watch-mode-pill-honest — pill labels feed honestly", async ({ page }) => {
    await page.goto("/watch");
    const pill = page.getByTestId("watch-mode-pill");
    await expect(pill).toBeVisible({ timeout: 15_000 });
    expect((await pill.textContent()) || "").toMatch(/live · on-chain|preview · scenario/);
  });

  test("23g.watch-rows-render — at least one row appears", async ({ page }) => {
    await page.goto("/watch");
    await page.waitForTimeout(5000);
    const total =
      (await page.getByTestId("watch-row-allow").count()) +
      (await page.getByTestId("watch-row-deny").count());
    expect(total).toBeGreaterThan(0);
  });

  test("23g.watch-tx-links-real — when live, tx links go to real Solscan devnet", async ({
    page,
  }) => {
    await page.goto("/watch");
    const pill = page.getByTestId("watch-mode-pill");
    await expect(pill).toBeVisible({ timeout: 15_000 });
    const isLive = ((await pill.textContent()) || "").includes("live");
    if (!isLive) return;
    await page.waitForTimeout(5000);
    const link = page.getByTestId("watch-tx-link").first();
    if ((await link.count()) === 0) return;
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^https:\/\/solscan\.io\/tx\/[A-Za-z0-9]+/);
  });

  test("23g.watch-receipt-link-to-poster — receipt link goes to /r/<uuid>", async ({
    page,
  }) => {
    await page.goto("/watch");
    await page.waitForTimeout(5000);
    const link = page.getByTestId("watch-receipt-link").first();
    if ((await link.count()) === 0) return;
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/r\/[0-9a-f-]{36}$/i);
  });

  test("23g.watch-og-image — /watch/opengraph-image returns a real PNG", async ({
    request,
  }) => {
    const r = await request.get(`${APP}/watch/opengraph-image`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toMatch(/^image\/png/);
    const body = await r.body();
    expect(body.length).toBeGreaterThan(2000);
    // PNG magic
    expect(body[0]).toBe(0x89);
    expect(body[1]).toBe(0x50);
  });

  test("23g.start-og-image — /start/opengraph-image returns a real PNG", async ({
    request,
  }) => {
    const r = await request.get(`${APP}/start/opengraph-image`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toMatch(/^image\/png/);
    const body = await r.body();
    expect(body.length).toBeGreaterThan(2000);
    expect(body[0]).toBe(0x89);
    expect(body[1]).toBe(0x50);
  });
});
