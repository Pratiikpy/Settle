/**
 * seed-burner — Playwright helper that pre-seeds a Settle E2E burner
 * keypair into a browser context's localStorage BEFORE the page mounts
 * the wallet provider.
 *
 * Use this for Section 21c (cross-wallet UI sync) and Section 23a
 * (UI → on-chain bridge) tests where each context needs to sign as a
 * specific funded persona.
 *
 * Usage:
 *   import { seedBurnerInContext, ALICE_KEY, BOB_KEY } from "./helpers/seed-burner";
 *   const aliceCtx = await browser.newContext();
 *   await seedBurnerInContext(aliceCtx, ALICE_KEY);
 *   const alicePage = await aliceCtx.newPage();
 *   await alicePage.goto("/?stay=1");
 *   // alice's burner button now signs as ALICE
 */
import type { BrowserContext } from "@playwright/test";
import bs58 from "bs58";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function toBase58(relPath: string): string | null {
  // Playwright spawns specs from apps/web/, so the repo root is two levels up.
  const root = resolve(process.cwd(), "..", "..");
  const full = resolve(root, relPath);
  if (!existsSync(full)) return null;
  const arr = JSON.parse(readFileSync(full, "utf8")) as number[];
  return bs58.encode(Buffer.from(arr));
}

export const ALICE_KEY = toBase58(".test-wallet.json");
export const BOB_KEY = toBase58(".test-merchant.json");
export const CAROL_KEY = toBase58(".test-carol.json");

export async function seedBurnerInContext(ctx: BrowserContext, base58: string | null) {
  if (!base58) {
    throw new Error("seed-burner: keypair file not found — run scripts/bootstrap-test-wallets.ts first");
  }
  await ctx.addInitScript(({ b58 }: { b58: string }) => {
    try {
      window.localStorage.setItem("settle-e2e-burner-key", b58);
    } catch {
      /* ignore */
    }
  }, { b58: base58 });
}

/**
 * Convenience: open a new context with a persona keypair pre-seeded.
 */
export async function openPersonaContext(
  browser: import("@playwright/test").Browser,
  base58: string | null,
) {
  const ctx = await browser.newContext();
  await seedBurnerInContext(ctx, base58);
  return ctx;
}
