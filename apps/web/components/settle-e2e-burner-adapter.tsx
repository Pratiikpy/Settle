"use client";

/**
 * SettleE2EBurnerAdapter
 * ----------------------
 * A wallet adapter that loads its keypair from one of (in order):
 *   1. `localStorage["settle-e2e-burner-key"]` — base58 64-byte secret
 *   2. `process.env.NEXT_PUBLIC_E2E_BURNER_KEY` — base58 64-byte secret
 *   3. fallback: a fresh random keypair (legacy behavior, no funds)
 *
 * This is what unlocks Section 21c (cross-wallet UI sync) and Section
 * 23a (UI → on-chain bridge). With this adapter, Playwright can pre-seed
 * a funded ALICE / BOB / CAROL persona into separate `browser.newContext()`
 * instances and have UI clicks land real on-chain txs as that persona.
 *
 * Build-time: only loads + becomes the wallet when
 * `NEXT_PUBLIC_E2E_BURNER === "1"`. Otherwise UnsafeBurnerWalletAdapter is
 * used (random keypair) or the adapter is not added at all.
 *
 * USAGE
 * -----
 * Replace `new UnsafeBurnerWalletAdapter()` in `app/providers.tsx` with
 * `new SettleE2EBurnerAdapter()`. Behavior is backward-compatible: no
 * localStorage key set → falls back to a random keypair (same as
 * UnsafeBurnerWalletAdapter today).
 *
 * In Playwright global-setup:
 *   await context.addInitScript(({ b58 }) => {
 *     localStorage.setItem("settle-e2e-burner-key", b58);
 *   }, { b58: ALICE_BURNER_BASE58 });
 */

import {
  BaseMessageSignerWalletAdapter,
  WalletName,
  WalletReadyState,
  type SupportedTransactionVersions,
} from "@solana/wallet-adapter-base";
import { Keypair, Transaction, VersionedTransaction, type PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

const STORAGE_KEY = "settle-e2e-burner-key";

export const SettleE2EBurnerWalletName =
  "E2E Persona" as WalletName<"E2E Persona">;

function loadKeypair(): Keypair {
  // 1. localStorage (Playwright sets this per browser-context)
  if (typeof window !== "undefined" && window.localStorage) {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v) {
      try {
        const decoded = bs58.decode(v);
        if (decoded.length === 64) {
          return Keypair.fromSecretKey(decoded);
        }
      } catch {
        /* fall through to env */
      }
    }
  }
  // 2. Build-time env var
  const env = process.env.NEXT_PUBLIC_E2E_BURNER_KEY;
  if (env) {
    try {
      const decoded = bs58.decode(env);
      if (decoded.length === 64) {
        return Keypair.fromSecretKey(decoded);
      }
    } catch {
      /* fall through to random */
    }
  }
  // 3. Fallback — same as UnsafeBurnerWalletAdapter
  return Keypair.generate();
}

export class SettleE2EBurnerAdapter extends BaseMessageSignerWalletAdapter {
  readonly name = SettleE2EBurnerWalletName;
  readonly url = "https://github.com/anza-xyz/wallet-adapter";
  readonly icon =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiMwOTA5MGIiLz48dGV4dCB4PSI1MCUiIHk9IjU0JSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI2ZmZiIgZm9udC1zaXplPSI4Ij5FMkU8L3RleHQ+PC9zdmc+";
  readonly supportedTransactionVersions: SupportedTransactionVersions = new Set([0, "legacy"]);

  private _kp: Keypair | null = null;
  private _publicKey: PublicKey | null = null;
  private _connecting = false;
  private _readyState =
    typeof window === "undefined"
      ? WalletReadyState.Unsupported
      : window.localStorage?.getItem(STORAGE_KEY) ||
          process.env.NEXT_PUBLIC_E2E_BURNER_KEY
        ? WalletReadyState.Loadable
        : // No persona seeded — keep the adapter NotDetected so it doesn't
          // hijack auto-connect. Tests that need it pre-seed via
          // seedBurnerInContext + addInitScript before page load.
          WalletReadyState.NotDetected;

  get publicKey() {
    return this._publicKey;
  }
  get connecting() {
    return this._connecting;
  }
  get readyState() {
    return this._readyState;
  }

  override async connect(): Promise<void> {
    if (this.connected || this.connecting) return;
    if (
      this._readyState !== WalletReadyState.Installed &&
      this._readyState !== WalletReadyState.Loadable
    ) {
      throw new Error("burner adapter not loadable here");
    }
    this._connecting = true;
    try {
      const kp = loadKeypair();
      this._kp = kp;
      this._publicKey = kp.publicKey;
      this.emit("connect", kp.publicKey);
    } finally {
      this._connecting = false;
    }
  }

  override async disconnect(): Promise<void> {
    this._kp = null;
    this._publicKey = null;
    this.emit("disconnect");
  }

  override async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (!this._kp) throw new Error("not connected");
    if (tx instanceof VersionedTransaction) {
      tx.sign([this._kp]);
    } else {
      tx.partialSign(this._kp);
    }
    return tx;
  }

  override async signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[],
  ): Promise<T[]> {
    return Promise.all(txs.map((t) => this.signTransaction(t)));
  }

  override async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this._kp) throw new Error("not connected");
    // Lazy-import tweetnacl (transitive dep of @solana/web3.js) without
    // adding a direct package dep — the type cast keeps tsc quiet.
    const naclMod = (await import(/* webpackIgnore: false */ "tweetnacl" as string)) as {
      default?: { sign: { detached(m: Uint8Array, k: Uint8Array): Uint8Array } };
      sign: { detached(m: Uint8Array, k: Uint8Array): Uint8Array };
    };
    const sign = naclMod.default?.sign ?? naclMod.sign;
    return sign.detached(message, this._kp.secretKey);
  }
}
