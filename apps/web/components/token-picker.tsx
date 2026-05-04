"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { listUserTokenBalances, type TokenBalance } from "../lib/token-balances";

/**
 * F12 — TokenPicker.
 *
 * Inline dropdown for choosing the input mint on /send. Lists the connected wallet's
 * non-zero SPL balances + native SOL. USDC is pinned to the top because it's the
 * fee-free path (no swap), then everything else by atomic balance desc.
 *
 * Design choice: this is not a modal — it's a panel anchored to the trigger button. The
 * trigger renders compactly inside the amount field group so the user perceives "amount
 * + token" as a single control, matching how Jupiter / Phantom render swap inputs.
 *
 * The user *can* type a mint manually too (via the search box), even if it's not in
 * their wallet. We don't pre-validate against the Jupiter token list — the swap endpoint
 * will surface a quote_failed if the route doesn't exist, and that's the honest signal.
 */

const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

export interface SelectedToken {
  mint: string;
  symbol: string;
  decimals: number;
  /** Optional UI-friendly balance string for the trigger. */
  uiAmount?: string;
  logoURI?: string;
}

export function TokenPicker({
  value,
  onChange,
  cluster,
}: {
  value: SelectedToken;
  onChange: (next: SelectedToken) => void;
  cluster: "mainnet" | "devnet";
}) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [open, setOpen] = useState(false);
  const [balances, setBalances] = useState<TokenBalance[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const usdcMint =
    cluster === "mainnet"
      ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      : "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

  useEffect(() => {
    if (!open || !publicKey) return;
    if (balances !== null) return; // session cache: refetch only on first open
    let cancelled = false;
    setLoading(true);
    setError(null);
    listUserTokenBalances(connection, publicKey)
      .then((rows) => {
        if (!cancelled) setBalances(rows);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, publicKey, connection, balances]);

  // Sort: USDC first, then SOL second (most users keep SOL for fees), then by amount desc
  const sortedAndFiltered = useMemo(() => {
    if (!balances) return [];
    const q = search.trim().toLowerCase();
    const matches = (b: TokenBalance) =>
      !q ||
      b.mint.toLowerCase().includes(q) ||
      b.symbol?.toLowerCase().includes(q) ||
      b.name?.toLowerCase().includes(q);

    const filtered = balances.filter(matches);
    return filtered.sort((a, b) => {
      if (a.mint === usdcMint) return -1;
      if (b.mint === usdcMint) return 1;
      if (a.mint === NATIVE_SOL_MINT) return -1;
      if (b.mint === NATIVE_SOL_MINT) return 1;
      const aA = BigInt(a.amount);
      const bA = BigInt(b.amount);
      if (aA > bA) return -1;
      if (aA < bA) return 1;
      return 0;
    });
  }, [balances, search, usdcMint]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-[#a1a1aa] bg-[#f4f4f5] px-3 py-1.5 text-xs font-medium hover:bg-[#e4e4e7]"
      >
        {value.logoURI ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.logoURI} alt="" className="h-4 w-4 rounded-full" />
        ) : (
          <span className="grid h-4 w-4 place-items-center rounded-full bg-[#e4e4e7] text-[8px]">
            {value.symbol.slice(0, 2)}
          </span>
        )}
        <span>{value.symbol}</span>
        {value.uiAmount && (
          <span className="text-[#52525b]">{value.uiAmount}</span>
        )}
        <span className="text-[#71717a]">▾</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-full z-20 mt-2 w-80 overflow-hidden rounded-xl border border-[#e4e4e7] bg-background shadow-2xl">
            <div className="border-b border-[#e4e4e7] p-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by symbol or paste mint…"
                className="w-full rounded-md border border-[#e4e4e7] bg-transparent px-3 py-2 text-xs outline-none focus:border-accent"
                autoFocus
              />
            </div>

            <div className="max-h-72 overflow-y-auto">
              {!publicKey ? (
                <div className="p-6 text-center text-xs text-[#52525b]">
                  Connect a wallet to see your tokens.
                </div>
              ) : loading ? (
                <div className="p-6 text-center text-xs text-[#52525b]">
                  Loading balances…
                </div>
              ) : error ? (
                <div className="p-6 text-center text-xs text-red-500">{error}</div>
              ) : sortedAndFiltered.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#52525b]">
                  No matching tokens. {search && "Try the full mint address?"}
                </div>
              ) : (
                <ul className="divide-y divide-foreground/5">
                  {sortedAndFiltered.map((b) => {
                    const sym = b.symbol ?? `${b.mint.slice(0, 4)}…${b.mint.slice(-4)}`;
                    const isUsdc = b.mint === usdcMint;
                    const isSelected = b.mint === value.mint;
                    return (
                      <li key={`${b.mint}-${b.programId}`}>
                        <button
                          type="button"
                          onClick={() => {
                            onChange({
                              mint: b.mint,
                              symbol: sym,
                              decimals: b.decimals,
                              uiAmount: b.uiAmount,
                              ...(b.logoURI ? { logoURI: b.logoURI } : {}),
                            });
                            setOpen(false);
                            setSearch("");
                          }}
                          className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs hover:bg-[#f4f4f5] ${
                            isSelected ? "bg-accent/5" : ""
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {b.logoURI ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={b.logoURI}
                                alt=""
                                className="h-7 w-7 rounded-full"
                              />
                            ) : (
                              <div className="grid h-7 w-7 place-items-center rounded-full bg-[#e4e4e7] text-[10px]">
                                {sym.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium">{sym}</span>
                                {isUsdc && (
                                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-emerald-500">
                                    direct
                                  </span>
                                )}
                              </div>
                              {b.name && (
                                <div className="text-[10px] text-[#52525b]">{b.name}</div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono">{b.uiAmount}</div>
                            <div className="text-[10px] text-[#71717a]">
                              {b.mint.slice(0, 4)}…{b.mint.slice(-4)}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-[#e4e4e7] bg-[#f4f4f5] px-4 py-2 text-[10px] text-[#52525b]">
              Pay with any token — Jupiter routes the swap on mainnet. USDC sends directly.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
