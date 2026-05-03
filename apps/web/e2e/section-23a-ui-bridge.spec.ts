import { test, expect, type Page } from "@playwright/test";
import { openPersonaContext, ALICE_KEY, BOB_KEY } from "./helpers/seed-burner";
import { Connection, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { resolve } from "path";
import bs58 from "bs58";

/**
 * Section 23a — UI → on-chain bridge tests.
 *
 * Each test connects through the UI as a funded persona (via the
 * SettleE2EBurnerAdapter) so a real button click can actually land a tx
 * on devnet.
 *
 * NOTE: most tests gate the on-chain assertion behind "if the wallet
 * has funds + the route exposes the action". The first wave proves the
 * adapter wiring works end-to-end and that connect-as-persona flips the
 * page from "Connect a wallet" empty state to a real connected dashboard.
 */

function loadPubkey(rel: string): PublicKey {
  const root = resolve(process.cwd(), "..", "..");
  const arr = JSON.parse(readFileSync(resolve(root, rel), "utf8")) as number[];
  return PublicKey.decode
    ? // legacy
      new PublicKey(bs58.encode(Buffer.from(arr.slice(32, 64))))
    : (() => {
        const { Keypair } = require("@solana/web3.js") as { Keypair: any };
        return Keypair.fromSecretKey(Uint8Array.from(arr)).publicKey;
      })();
}

async function connectE2EPersona(page: Page) {
  await page.goto("/?stay=1");
  const trigger = page.locator(".wallet-adapter-button-trigger").first();
  await trigger.waitFor({ state: "visible", timeout: 15_000 });
  await trigger.click();
  const item = page
    .locator(".wallet-adapter-modal-list li:has-text('E2E Persona')")
    .first();
  await item.waitFor({ state: "visible", timeout: 5000 });
  await item.click();
  // Wait for modal to dismiss
  await page
    .locator(".wallet-adapter-modal")
    .waitFor({ state: "detached", timeout: 5_000 })
    .catch(() => {});
}

test.describe("Section 23a · UI → on-chain bridge (real persona)", () => {
  test("23a.0a — ALICE persona connects + dashboard renders connected", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connectE2EPersona(page);
      await page.goto("/dashboard");
      await page.waitForFunction(
        () => document.body.getAttribute("data-w6") === "1",
        null,
        { timeout: 30_000 },
      );
      // The "connect a wallet" prompt should NOT be visible — we're connected
      const promptCount = await page
        .getByRole("heading", { name: /Connect a wallet to see your dashboard/i })
        .count();
      expect(promptCount).toBe(0);
      // The bento or hero must render
      const main = await page.locator("main").first().count();
      expect(main).toBeGreaterThan(0);
    } finally {
      await ctx.close();
    }
  });

  test("23a.0b — ALICE pubkey is reflected in the wallet trigger", async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connectE2EPersona(page);
      const trigger = page.locator(".wallet-adapter-button-trigger").first();
      const text = await trigger.textContent();
      // ALICE's pubkey starts with C5z7pQ
      expect(text).toContain("C5z7");
    } finally {
      await ctx.close();
    }
  });

  test("23a.0c — different personas yield different pubkeys (isolation)", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const aliceCtx = await openPersonaContext(browser, ALICE_KEY);
    const bobCtx = await openPersonaContext(browser, BOB_KEY);
    try {
      const alice = await aliceCtx.newPage();
      const bob = await bobCtx.newPage();
      await connectE2EPersona(alice);
      await connectE2EPersona(bob);
      const aliceTxt = await alice
        .locator(".wallet-adapter-button-trigger")
        .first()
        .textContent();
      const bobTxt = await bob
        .locator(".wallet-adapter-button-trigger")
        .first()
        .textContent();
      expect(aliceTxt).not.toBe(bobTxt);
      // ALICE prefix C5z7, BOB prefix Hrjj
      expect(aliceTxt).toContain("C5z7");
      expect(bobTxt).toContain("Hrjj");
    } finally {
      await aliceCtx.close();
      await bobCtx.close();
    }
  });

  test("23a.0d — devnet RPC is reachable from the test runner (sanity)", async () => {
    const conn = new Connection("https://api.devnet.solana.com", "confirmed");
    const slot = await conn.getSlot();
    expect(slot).toBeGreaterThan(0);
  });

  test("23a.send-form — connected ALICE sees /send with prefilled wallet state", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connectE2EPersona(page);
      await page.goto("/send");
      await page.waitForFunction(
        () => document.body.getAttribute("data-w6") === "1",
        null,
        { timeout: 30_000 },
      );
      const recipient = page
        .locator("input[placeholder='@handle']")
        .first();
      await expect(recipient).toBeVisible({ timeout: 15_000 });
      // The big primary CTA mentions the user's connect state — should NOT
      // say "Connect a wallet to send"
      const cta = page.locator("button.w6-btn-primary").first();
      const ctaText = await cta.textContent();
      expect(ctaText).not.toMatch(/Connect a wallet/i);
    } finally {
      await ctx.close();
    }
  });

  test("23a.cards-list — connected ALICE sees real /cards page (not connect prompt)", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const ctx = await openPersonaContext(browser, ALICE_KEY);
    try {
      const page = await ctx.newPage();
      await connectE2EPersona(page);
      await page.goto("/cards");
      await page.waitForFunction(
        () => document.body.getAttribute("data-w6") === "1",
        null,
        { timeout: 30_000 },
      );
      // Real connected page renders the 3 mode explainers
      const html = await page.content();
      expect(html).toMatch(/OneShot/);
      expect(html).toMatch(/Streaming/);
      expect(html).toMatch(/Delivery/i);
    } finally {
      await ctx.close();
    }
  });
});
