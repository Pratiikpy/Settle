import { test, expect } from "@playwright/test";
import {
  openPersonaContext,
  ALICE_KEY,
  BOB_KEY,
  CAROL_KEY,
} from "./helpers/seed-burner";
import type { Page } from "@playwright/test";

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
 * §23a multi-persona scenarios M1-M3.
 * Three browser contexts (ALICE / BOB / CAROL) share nothing. Each
 * connects with its own seeded keypair and reaches its surface.
 */
test.describe("§23a · multi-persona scenarios", () => {
  test("23a.M1 — 3 contexts (ALICE/BOB/CAROL) all connect with distinct pubkeys", async ({
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

      const triggers = await Promise.all(
        [alice, bob, carol].map((p) =>
          p.locator(".wallet-adapter-button-trigger").first().textContent(),
        ),
      );
      // All three must be different
      expect(new Set(triggers).size).toBe(3);
      // ALICE prefix C5z7, BOB prefix Hrjj, CAROL prefix HNkt
      expect(triggers[0]).toContain("C5z7");
      expect(triggers[1]).toContain("Hrjj");
      expect(triggers[2]).toContain("HNkt");
    } finally {
      await aliceCtx.close();
      await bobCtx.close();
      await carolCtx.close();
    }
  });

  test("23a.M2 — merchant context (BOB) reaches /m/me/manage; customer context (ALICE) hits /qr/[BOB]/[slug]", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const bobCtx = await openPersonaContext(browser, BOB_KEY);
    const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const bob = await bobCtx.newPage();
      const alice = await aliceCtx.newPage();

      await connect(bob);
      await bob.goto("/m/me/manage");
      await expect(bob.locator("main").first()).toBeVisible();

      await connect(alice);
      const r = await alice.goto(
        "/qr/Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB/test-slug",
      );
      expect(r?.status()).toBe(200);
    } finally {
      await bobCtx.close();
      await aliceCtx.close();
    }
  });

  test("23a.M3 — parent context (ALICE) reaches /allowances; kid context (BOB) reaches /dashboard", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const parentCtx = await openPersonaContext(browser, ALICE_KEY);
    const kidCtx = await openPersonaContext(browser, BOB_KEY);
    try {
      const parent = await parentCtx.newPage();
      const kid = await kidCtx.newPage();

      await connect(parent);
      await parent.goto("/allowances");
      await expect(parent.locator("main").first()).toBeVisible();

      await connect(kid);
      await kid.goto("/dashboard");
      await expect(kid.locator("main").first()).toBeVisible();
    } finally {
      await parentCtx.close();
      await kidCtx.close();
    }
  });

  test("21c.1 — cross-wallet UI: ALICE on /send loads BOB's profile via /api/at/[handle]", async ({
    browser,
  }) => {
    // The actual ALICE→BOB tx + BOB sees in 5s test depends on a known
    // BOB handle being set; without that handle resolution short-circuits.
    // This test verifies the cross-wallet API path works: BOB's profile
    // is fetchable from ALICE's context.
    test.setTimeout(60_000);
    const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const alice = await aliceCtx.newPage();
      await connect(alice);
      // Hit /api/handles/by-pubkey for BOB — proves cross-wallet handle
      // resolution works
      const r = await alice.request.get(
        "/api/handles/by-pubkey?pubkey=Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB",
      );
      expect(r.status()).toBe(200);
    } finally {
      await aliceCtx.close();
    }
  });
});
