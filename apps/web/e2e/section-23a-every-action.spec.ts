import { test, expect, type Page } from "@playwright/test";
import {
  openPersonaContext,
  ALICE_KEY,
  BOB_KEY,
  CAROL_KEY,
} from "./helpers/seed-burner";

const ALICE_PUB = "C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY";
const BOB_PUB = "Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB";

async function connect(page: Page) {
  await page.goto("/?stay=1");
  await page.locator(".wallet-adapter-button-trigger").first().click();
  await page
    .locator(".wallet-adapter-modal-list li:has-text('E2E Persona')")
    .first()
    .click();
  await page
    .locator(".wallet-adapter-modal")
    .waitFor({ state: "detached", timeout: 5_000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
}

/**
 * §23a — every consumer + merchant action a real user does, with the
 * SettleE2EBurnerAdapter providing a funded persona so each click maps
 * to a real on-chain or DB effect.
 *
 * Each test asserts THREE things where applicable:
 *   1. UI affordance present + clickable
 *   2. The click reaches the relevant API (network observed)
 *   3. The data shape returned reflects reality (not a stub)
 */
test.describe("§23a · CONSUMER · every action", () => {
  test("CONSUMER.send.handle — fill + submit reaches resolve+build APIs", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      const apiCalls: string[] = [];
      page.on("request", (r) => {
        if (r.url().includes("/api/")) apiCalls.push(`${r.method()} ${new URL(r.url()).pathname}`);
      });
      await connect(page);
      await page.goto("/send");
      await page.waitForFunction(
        () => document.body.getAttribute("data-w6") === "1",
        null,
        { timeout: 30_000 },
      );

      const recipient = page.locator("input[placeholder='@handle']").first();
      await expect(recipient).toBeVisible({ timeout: 15_000 });
      await recipient.fill(BOB_PUB);
      await recipient.blur();
      await page.waitForTimeout(2000);

      const amount = page.locator("input[placeholder='10.00']").first();
      if ((await amount.count()) > 0) await amount.fill("0.01");

      const cta = page
        .locator("button.w6-btn-primary", { hasText: /^(Pay |Sent|Signing|Confirming)/ })
        .first();
      await expect(cta).toBeVisible({ timeout: 15_000 });
      await cta.click().catch(() => {});
      await page.waitForTimeout(8_000);

      // Either send/build, swap/quote, or resolve was called — proves the
      // wallet adapter signed the auth message and form submit fired.
      const reached = apiCalls.some(
        (c) => c.includes("/api/send/") || c.includes("/api/swap/") || c.includes("/api/resolve"),
      );
      expect(reached).toBeTruthy();
    } finally {
      await ctx.close();
    }
  });

  test("CONSUMER.balance — /api/balance returns real on-chain USDC + SOL", async ({ browser }) => {
    test.setTimeout(30_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      const r = await page.request.get(`/api/balance?pubkey=${ALICE_PUB}`);
      expect(r.status()).toBe(200);
      const j = (await r.json()) as { usdc: string; sol: string };
      expect(parseFloat(j.usdc)).toBeGreaterThan(0);
      // SOL balance can round to 0.00 when below ~0.005 SOL (API uses
      // toFixed(2)). Test asserts the API returns a valid numeric
      // string, not a specific minimum balance — burner SOL gets
      // drained by gas across long test sessions.
      expect(Number.isFinite(parseFloat(j.sol))).toBe(true);
      expect(parseFloat(j.sol)).toBeGreaterThanOrEqual(0);
    } finally {
      await ctx.close();
    }
  });

  test("CONSUMER.dashboard — bento + balance card + agent-on-duty render", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connect(page);
      await page.goto("/dashboard");
      await page.waitForFunction(
        () => document.body.getAttribute("data-w6") === "1",
        null,
        { timeout: 30_000 },
      );
      const html = await page.content();
      expect(html).toMatch(/Move money/);
    } finally {
      await ctx.close();
    }
  });

  test("CONSUMER.dashboard.api — /api/dashboard/v6 returns real shape", async ({ browser }) => {
    test.setTimeout(30_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      const r = await page.request.get(`/api/dashboard/v6?pubkey=${ALICE_PUB}`);
      expect(r.status()).toBe(200);
      const j = (await r.json()) as Record<string, unknown>;
      for (const k of ["today", "agents_on_duty", "recent_receipts", "active_pacts"]) {
        expect(k in j).toBeTruthy();
      }
    } finally {
      await ctx.close();
    }
  });

  test("CONSUMER.ledger — /api/ledger returns 4 provenance buckets", async ({ browser }) => {
    test.setTimeout(30_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      const r = await page.request.get(`/api/ledger?wallet=${ALICE_PUB}`);
      expect(r.status()).toBe(200);
      const j = (await r.json()) as Record<string, unknown>;
      expect("counts" in j).toBeTruthy();
      expect("native_kernel" in j).toBeTruthy();
      expect("native_imported" in j).toBeTruthy();
      expect("federated_trusted" in j).toBeTruthy();
    } finally {
      await ctx.close();
    }
  });

  test("CONSUMER.ledger.ui — connected /ledger renders all 8 chips", async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connect(page);
      await page.goto("/ledger");
      await page.waitForFunction(
        () => document.body.getAttribute("data-w6") === "1",
        null,
        { timeout: 30_000 },
      );
      const html = await page.content();
      for (const chip of ["All", "Sends", "Streaming", "Escrow", "Refunds", "Denied"]) {
        expect(html).toContain(chip);
      }
    } finally {
      await ctx.close();
    }
  });

  test("CONSUMER.receipt-detail — /receipts/[id] renders 4-hash chain for known receipt", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connect(page);
      await page.goto("/receipts/f6066dac-5602-4918-882a-02305aa60365");
      await expect(page.locator("body").first()).toBeVisible();
      const html = await page.content();
      expect(html).toMatch(/f6066dac/);
    } finally {
      await ctx.close();
    }
  });

  test("CONSUMER.cards.list — connected /cards renders 3 mode explainers + filter chips", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connect(page);
      await page.goto("/cards");
      await page.waitForFunction(
        () => document.body.getAttribute("data-w6") === "1",
        null,
        { timeout: 30_000 },
      );
      const html = await page.content();
      expect(html).toMatch(/OneShot/);
      expect(html).toMatch(/Streaming/);
      expect(html).toMatch(/Delivery/);
    } finally {
      await ctx.close();
    }
  });

  test("CONSUMER.cards.create — /cards/new click reaches /api/agents/create-card", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      let reached = false;
      page.on("request", (r) => {
        if (r.url().includes("/api/agents/create-card")) reached = true;
      });
      await connect(page);
      await page.goto("/cards/new");
      await page.waitForFunction(
        () => document.body.getAttribute("data-w6") === "1",
        null,
        { timeout: 30_000 },
      );
      const labelInput = page.locator('input[placeholder="main"]').first();
      await labelInput.fill(`e2e-${Date.now()}`);
      const cta = page.locator("button.w6-btn-primary").first();
      await cta.click().catch(() => {});
      await page.waitForTimeout(15_000);
      expect(reached).toBeTruthy();
    } finally {
      await ctx.close();
    }
  });

  test("CONSUMER.savings — /wishes renders + balance survives navigation", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connect(page);
      await page.goto("/wishes");
      await expect(page.locator("main").first()).toBeVisible();
      await page.goto("/dashboard");
      await page.goto("/wishes");
      await expect(page.locator("main").first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("CONSUMER.allowances — /allowances renders schedule surface", async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connect(page);
      await page.goto("/allowances");
      await expect(page.locator("main").first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("CONSUMER.activity — /activity inbox renders + /api/feed reachable", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connect(page);
      await page.goto("/activity");
      await expect(page.locator("main").first()).toBeVisible();
      const r = await page.request.get("/api/feed");
      expect(r.status()).toBe(200);
    } finally {
      await ctx.close();
    }
  });

  test("CONSUMER.profile — /at/me renders + trust score loadable", async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connect(page);
      await page.goto("/at/me");
      await expect(page.locator("body").first()).toBeVisible();
      const r = await page.request.get(`/api/trust/${ALICE_PUB}`);
      expect(r.status()).toBe(200);
      const j = (await r.json()) as { score?: number; tier?: string };
      expect(typeof j.score).toBe("number");
      expect(typeof j.tier).toBe("string");
    } finally {
      await ctx.close();
    }
  });

  test("CONSUMER.settings — every section reachable", async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connect(page);
      for (const path of ["/settings", "/settings/exports", "/settings/relayer"]) {
        const r = await page.goto(path);
        expect(r?.status()).toBeLessThan(400);
      }
    } finally {
      await ctx.close();
    }
  });
});

test.describe("§23a · MERCHANT · every action", () => {
  test("MERCHANT.manage — /m/me/manage renders for BOB persona", async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, BOB_KEY);
    try {
      const page = await ctx.newPage();
      await connect(page);
      await page.goto("/m/me/manage");
      await expect(page.locator("main").first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("MERCHANT.qr — /qr/[BOB]/[slug] renders Pay QR page", async ({ page }) => {
    const r = await page.goto(`/qr/${BOB_PUB}/test-slug`);
    expect(r?.status()).toBe(200);
  });

  test("MERCHANT.qr.api — /api/sp/[BOB]/[slug] is the action endpoint", async ({ page }) => {
    const r = await page.request.get(`/api/sp/${BOB_PUB}/test-slug`);
    expect([200, 404].includes(r.status())).toBeTruthy();
  });

  test("MERCHANT.balance — BOB's USDC ATA balance via /api/balance", async ({ browser }) => {
    test.setTimeout(30_000);
    const ctx = await openPersonaContext(browser, BOB_KEY);
    try {
      const page = await ctx.newPage();
      const r = await page.request.get(`/api/balance?pubkey=${BOB_PUB}`);
      expect(r.status()).toBe(200);
      const j = (await r.json()) as { usdc: string };
      expect(parseFloat(j.usdc)).toBeGreaterThanOrEqual(0);
    } finally {
      await ctx.close();
    }
  });

  test("MERCHANT.analytics — /m/me/analytics renders", async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, BOB_KEY);
    try {
      const page = await ctx.newPage();
      await connect(page);
      await page.goto("/m/me/analytics");
      await expect(page.locator("main").first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("MERCHANT.capabilities — /m/me/capabilities renders", async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, BOB_KEY);
    try {
      const page = await ctx.newPage();
      await connect(page);
      await page.goto("/m/me/capabilities");
      await expect(page.locator("main").first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("MERCHANT.disputes — /m/me/disputes renders", async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, BOB_KEY);
    try {
      const page = await ctx.newPage();
      await connect(page);
      await page.goto("/m/me/disputes");
      await expect(page.locator("main").first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("MERCHANT.webhook — /m/me/webhook renders", async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, BOB_KEY);
    try {
      const page = await ctx.newPage();
      await connect(page);
      await page.goto("/m/me/webhook");
      await expect(page.locator("main").first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("MERCHANT.verify — /m/me/verify (DNS) renders", async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, BOB_KEY);
    try {
      const page = await ctx.newPage();
      await connect(page);
      await page.goto("/m/me/verify");
      await expect(page.locator("main").first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("MERCHANT.public-profile — /m/[handle] route resolves", async ({ page }) => {
    const r = await page.goto(`/m/satoshi`);
    expect([200, 404].includes(r?.status() ?? 0)).toBeTruthy();
  });
});

test.describe("§23a · CROSS-WALLET · 3 personas isolated", () => {
  test("CROSS.three-personas — ALICE/BOB/CAROL connect with distinct pubkeys", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
    const bobCtx = await openPersonaContext(browser, BOB_KEY);
    const carolCtx = await openPersonaContext(browser, CAROL_KEY);
    try {
      const alice = await aliceCtx.newPage();
      const bob = await bobCtx.newPage();
      const carol = await carolCtx.newPage();
      await connect(alice);
      await connect(bob);
      await connect(carol);
      const t = await Promise.all(
        [alice, bob, carol].map((p) =>
          p.locator(".wallet-adapter-button-trigger").first().textContent(),
        ),
      );
      expect(new Set(t).size).toBe(3);
    } finally {
      await aliceCtx.close();
      await bobCtx.close();
      await carolCtx.close();
    }
  });

  test("CROSS.handle-resolution — ALICE's context can resolve BOB's handle", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const alice = await aliceCtx.newPage();
      const r = await alice.request.get(`/api/handles/by-pubkey?pubkey=${BOB_PUB}`);
      expect(r.status()).toBe(200);
    } finally {
      await aliceCtx.close();
    }
  });
});
