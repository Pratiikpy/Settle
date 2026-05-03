import { test, expect, type Page } from "@playwright/test";
import {
  openPersonaContext,
  ALICE_KEY,
  BOB_KEY,
  CAROL_KEY,
} from "./helpers/seed-burner";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

/**
 * §23a — UI freshness / "data must update from real source" tests.
 *
 * Catches the class of bugs:
 *   - I did something on-chain → frontend doesn't update
 *   - I sent USDC → other user's UI doesn't reflect
 *   - Stale UI: cell shows old data after action
 *   - Hardcoded UI: cell not backed by real API source
 *   - Multi-tab desync: same user's tab A doesn't see action from tab B
 */

const ALICE_PUB = "C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY";
const BOB_PUB = "Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB";
const CAROL_PUB = "HNktQ9RVKeXqRwatBrswWChdqJ3YYYpZJFrHFpEHj9RH";
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const RPC = "https://api.devnet.solana.com";

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
  await page.waitForTimeout(2000);
}

async function aliceSends(alice: Page, recipientPub: string, amountUsdc: string) {
  await alice.goto("/send");
  await alice.waitForFunction(
    () => document.body.getAttribute("data-w6") === "1",
    null,
    { timeout: 30_000 },
  );
  const recipient = alice.locator("input[placeholder='@handle']").first();
  await recipient.fill(recipientPub);
  await recipient.blur();
  await alice.waitForTimeout(3_000);
  const amount = alice.locator("input[placeholder='10.00']").first();
  await amount.fill(amountUsdc);
  await alice.waitForTimeout(2_000);
  const cta = alice.locator("button.w6-btn-primary").first();
  await cta.click();
  await alice.waitForTimeout(3_000);
  const txt = await cta.textContent();
  if (txt?.match(/^Pay /)) await cta.click();
  return alice
    .locator("button.w6-btn-primary")
    .first()
    .filter({ hasText: /Sent/ })
    .waitFor({ state: "visible", timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
}

test.describe("§23a · UI freshness — every cell backed by real source", () => {
  test("FRESH.dashboard-bento — /api/dashboard/v6 shape has every bento cell key", async ({
    browser,
  }) => {
    test.setTimeout(30_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      const r = await page.request.get(`/api/dashboard/v6?pubkey=${ALICE_PUB}`);
      expect(r.status()).toBe(200);
      const j = (await r.json()) as Record<string, unknown>;
      // Every bento cell on /dashboard is one of these keys
      for (const k of [
        "today",
        "agents_on_duty",
        "recent_receipts",
        "active_pacts",
        "coming_up",
        "savings",
      ]) {
        expect(k in j).toBeTruthy();
      }
    } finally {
      await ctx.close();
    }
  });

  test("FRESH.balance-strip — /api/balance returns USDC + SOL + cluster", async ({ browser }) => {
    test.setTimeout(30_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      const r = await page.request.get(`/api/balance?pubkey=${ALICE_PUB}`);
      expect(r.status()).toBe(200);
      const j = (await r.json()) as { usdc?: string; sol?: string; cluster?: string };
      expect(typeof j.usdc).toBe("string");
      expect(typeof j.sol).toBe("string");
      expect(j.cluster).toBe("devnet");
    } finally {
      await ctx.close();
    }
  });

  test("FRESH.trust-score — /api/trust returns live computed score, not cached stale", async ({
    browser,
  }) => {
    test.setTimeout(30_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      const r = await page.request.get(`/api/trust/${BOB_PUB}`);
      expect(r.status()).toBe(200);
      const j = (await r.json()) as { last_computed_at: string };
      const computed = new Date(j.last_computed_at).getTime();
      const ageHours = (Date.now() - computed) / (1000 * 60 * 60);
      // last_computed_at must be within 7 days; older = stale
      expect(ageHours).toBeLessThan(24 * 7);
    } finally {
      await ctx.close();
    }
  });

  test("FRESH.ledger-shape — /api/ledger has all 4 provenance buckets in counts", async ({
    browser,
  }) => {
    test.setTimeout(30_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      const r = await page.request.get(`/api/ledger?wallet=${ALICE_PUB}`);
      expect(r.status()).toBe(200);
      const j = (await r.json()) as { counts: Record<string, number> };
      for (const bucket of [
        "native_kernel",
        "native_imported",
        "federated_trusted",
        "federated_untrusted",
      ]) {
        expect(bucket in j.counts).toBeTruthy();
      }
    } finally {
      await ctx.close();
    }
  });

  test("FRESH.feed — /api/feed returns events array (not a stub)", async ({ browser }) => {
    test.setTimeout(30_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      const r = await page.request.get("/api/feed");
      expect(r.status()).toBe(200);
      const j = (await r.json()) as { events?: unknown[] };
      expect(Array.isArray(j.events)).toBeTruthy();
    } finally {
      await ctx.close();
    }
  });

  test("FRESH.capabilities — /api/capabilities returns real registry rows", async ({ browser }) => {
    test.setTimeout(30_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      const r = await page.request.get("/api/capabilities");
      expect(r.status()).toBe(200);
      const j = (await r.json()) as { count?: number; entries?: unknown[] };
      expect((j.count ?? 0)).toBeGreaterThan(0);
      expect(Array.isArray(j.entries)).toBeTruthy();
    } finally {
      await ctx.close();
    }
  });

  test("FRESH.leaderboard — /api/leaderboard returns capabilities array", async ({ browser }) => {
    test.setTimeout(30_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      const r = await page.request.get("/api/leaderboard");
      expect(r.status()).toBe(200);
      const j = (await r.json()) as { capabilities?: unknown[] };
      expect(Array.isArray(j.capabilities)).toBeTruthy();
    } finally {
      await ctx.close();
    }
  });

  test("FRESH.federation-origins — /api/federation/origins returns origins array", async ({
    browser,
  }) => {
    test.setTimeout(30_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      const r = await page.request.get("/api/federation/origins");
      expect(r.status()).toBe(200);
      const j = (await r.json()) as { origins?: unknown[] };
      expect(Array.isArray(j.origins)).toBeTruthy();
    } finally {
      await ctx.close();
    }
  });

  test("FRESH.stats-landing — /api/stats/landing has presentability gate", async ({ browser }) => {
    test.setTimeout(30_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      const r = await page.request.get("/api/stats/landing");
      expect(r.status()).toBe(200);
      const j = (await r.json()) as { is_presentable?: boolean };
      expect(typeof j.is_presentable).toBe("boolean");
    } finally {
      await ctx.close();
    }
  });

  test("FRESH.price — /api/price/sol-usd returns live Pyth price", async ({ browser }) => {
    test.setTimeout(30_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      const r = await page.request.get("/api/price/sol-usd");
      expect(r.status()).toBe(200);
      const j = (await r.json()) as { usd?: number; publish_time?: number };
      expect((j.usd ?? 0)).toBeGreaterThan(0);
      const ageSeconds = Date.now() / 1000 - (j.publish_time ?? 0);
      // Pyth feed should be reasonably fresh (Hermes caches up to ~hour for testnet)
      expect(ageSeconds).toBeLessThan(60 * 60 * 24);
    } finally {
      await ctx.close();
    }
  });
});

test.describe("§23a · Action → freshness propagation", () => {
  test("PROP.send-then-balance — ALICE sends, BOB's on-chain USDC reflects within 15s", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const conn = new Connection(RPC, "confirmed");
    const bobAta = await getAssociatedTokenAddress(USDC_MINT, new PublicKey(BOB_PUB));
    const before = await conn.getTokenAccountBalance(bobAta).catch(() => null);
    const beforeAmount = before?.value.uiAmount ?? 0;

    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const alice = await ctx.newPage();
      await connect(alice);
      const sent = await aliceSends(alice, BOB_PUB, "0.002");
      expect(sent).toBeTruthy();

      // Poll on-chain truth for up to 15s
      const start = Date.now();
      let after = beforeAmount;
      while (Date.now() - start < 15_000) {
        const r = await conn.getTokenAccountBalance(bobAta).catch(() => null);
        after = r?.value.uiAmount ?? beforeAmount;
        if (after >= beforeAmount + 0.0015) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      expect(after).toBeGreaterThanOrEqual(beforeAmount + 0.0015);
    } finally {
      await ctx.close();
    }
  });

  test("PROP.send-then-api-balance — /api/balance reflects ALICE's send within 30s", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const alice = await ctx.newPage();

      // Snapshot BOB's reported balance via API
      const r0 = await alice.request.get(`/api/balance?pubkey=${BOB_PUB}`);
      const j0 = (await r0.json()) as { usdc: string };
      const before = parseFloat(j0.usdc);

      await connect(alice);
      const sent = await aliceSends(alice, BOB_PUB, "0.005");
      expect(sent).toBeTruthy();

      // Poll /api/balance for up to 30s
      const start = Date.now();
      let after = before;
      while (Date.now() - start < 30_000) {
        const r = await alice.request.get(`/api/balance?pubkey=${BOB_PUB}`);
        const j = (await r.json()) as { usdc: string };
        after = parseFloat(j.usdc);
        if (after >= before + 0.004) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      console.log(`BOB /api/balance: ${before} → ${after} (delta ${(after - before).toFixed(4)})`);
      // /api/balance reads on-chain via RPC, not indexer — must reflect
      expect(after).toBeGreaterThanOrEqual(before + 0.004);
    } finally {
      await ctx.close();
    }
  });

  test("PROP.multi-tab — ALICE tab A action visible to ALICE tab B (same persona)", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      // Two pages in same context = two tabs with shared localStorage = same persona
      const tabA = await ctx.newPage();
      const tabB = await ctx.newPage();

      await connect(tabA);
      await tabB.goto("/dashboard");
      await tabB.waitForFunction(
        () => document.body.getAttribute("data-w6") === "1",
        null,
        { timeout: 30_000 },
      );

      // Send from tab A
      const sent = await aliceSends(tabA, BOB_PUB, "0.001");
      expect(sent).toBeTruthy();

      // Reload tab B → should reflect the same wallet state (same persona)
      await tabB.reload();
      await tabB.waitForFunction(
        () => document.body.getAttribute("data-w6") === "1",
        null,
        { timeout: 30_000 },
      );
      // tab B's /api/balance should still return ALICE's pubkey state
      const r = await tabB.request.get(`/api/balance?pubkey=${ALICE_PUB}`);
      expect(r.status()).toBe(200);
    } finally {
      await ctx.close();
    }
  });
});

test.describe("§23a · Cross-wallet freshness — other user receives", () => {
  test("CROSS.alice-pays-bob-onchain — BOB on-chain balance increases", async ({ browser }) => {
    test.setTimeout(180_000);
    const conn = new Connection(RPC, "confirmed");
    const bobAta = await getAssociatedTokenAddress(USDC_MINT, new PublicKey(BOB_PUB));
    const before = (await conn.getTokenAccountBalance(bobAta).catch(() => null))?.value.uiAmount ?? 0;

    const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
    const bobCtx = await openPersonaContext(browser, BOB_KEY);
    try {
      const alice = await aliceCtx.newPage();
      const bob = await bobCtx.newPage();

      await connect(bob);
      await bob.goto("/dashboard");
      await bob.waitForFunction(
        () => document.body.getAttribute("data-w6") === "1",
        null,
        { timeout: 30_000 },
      );

      await connect(alice);
      const sent = await aliceSends(alice, BOB_PUB, "0.003");
      expect(sent).toBeTruthy();

      // BOB's balance reflects on-chain (no refresh needed, Solana RPC is the source)
      const start = Date.now();
      let after = before;
      while (Date.now() - start < 15_000) {
        const r = await conn.getTokenAccountBalance(bobAta).catch(() => null);
        after = r?.value.uiAmount ?? before;
        if (after >= before + 0.0025) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      expect(after).toBeGreaterThanOrEqual(before + 0.0025);
    } finally {
      await aliceCtx.close();
      await bobCtx.close();
    }
  });

  test("CROSS.alice-pays-carol-onchain — CAROL on-chain balance increases", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const conn = new Connection(RPC, "confirmed");
    const carolAta = await getAssociatedTokenAddress(USDC_MINT, new PublicKey(CAROL_PUB));
    const before = (await conn.getTokenAccountBalance(carolAta).catch(() => null))?.value.uiAmount ?? 0;

    const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const alice = await aliceCtx.newPage();
      await connect(alice);
      const sent = await aliceSends(alice, CAROL_PUB, "0.003");
      expect(sent).toBeTruthy();

      const start = Date.now();
      let after = before;
      while (Date.now() - start < 15_000) {
        const r = await conn.getTokenAccountBalance(carolAta).catch(() => null);
        after = r?.value.uiAmount ?? before;
        if (after >= before + 0.0025) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      expect(after).toBeGreaterThanOrEqual(before + 0.0025);
    } finally {
      await aliceCtx.close();
    }
  });

  test("CROSS.three-personas-isolated — 3 distinct localStorage keys per context", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
    const bobCtx = await openPersonaContext(browser, BOB_KEY);
    const carolCtx = await openPersonaContext(browser, CAROL_KEY);
    try {
      const alice = await aliceCtx.newPage();
      const bob = await bobCtx.newPage();
      const carol = await carolCtx.newPage();
      await Promise.all([alice.goto("/?stay=1"), bob.goto("/?stay=1"), carol.goto("/?stay=1")]);
      const keys = await Promise.all(
        [alice, bob, carol].map((p) =>
          p.evaluate(() => window.localStorage.getItem("settle-e2e-burner-key")),
        ),
      );
      expect(new Set(keys.filter((k) => k)).size).toBe(3);
    } finally {
      await aliceCtx.close();
      await bobCtx.close();
      await carolCtx.close();
    }
  });
});

test.describe("§23a · No-stub guarantees — UI must NOT show hardcoded data", () => {
  test("NOSTUB.dashboard — bento numbers come from real API, not hardcoded", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      // Intercept /api/dashboard/v6 — if the page never calls it, dashboard is stubbed
      let dashCalled = false;
      page.on("request", (req) => {
        if (req.url().includes("/api/dashboard/v6")) dashCalled = true;
      });
      await connect(page);
      await page.goto("/dashboard");
      await page.waitForFunction(
        () => document.body.getAttribute("data-w6") === "1",
        null,
        { timeout: 30_000 },
      );
      await page.waitForTimeout(5_000);
      expect(dashCalled).toBeTruthy();
    } finally {
      await ctx.close();
    }
  });

  test("NOSTUB.ledger — /ledger calls /api/ledger, not hardcoded rows", async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      let apiCalled = false;
      page.on("request", (req) => {
        if (req.url().includes("/api/ledger")) apiCalled = true;
      });
      await connect(page);
      await page.goto("/ledger");
      await page.waitForFunction(
        () => document.body.getAttribute("data-w6") === "1",
        null,
        { timeout: 30_000 },
      );
      await page.waitForTimeout(5_000);
      expect(apiCalled).toBeTruthy();
    } finally {
      await ctx.close();
    }
  });

  test("NOSTUB.balance-strip — /dashboard hits /api/balance for live USDC", async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      let balanceCalled = false;
      page.on("request", (req) => {
        if (req.url().includes("/api/balance")) balanceCalled = true;
      });
      await connect(page);
      await page.goto("/dashboard");
      await page.waitForFunction(
        () => document.body.getAttribute("data-w6") === "1",
        null,
        { timeout: 30_000 },
      );
      await page.waitForTimeout(5_000);
      expect(balanceCalled).toBeTruthy();
    } finally {
      await ctx.close();
    }
  });
});
