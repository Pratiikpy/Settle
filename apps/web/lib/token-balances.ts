/**
 * SPL token balance helper (F12).
 *
 * Browser-side: enumerate the user's SPL token accounts via getParsedTokenAccountsByOwner,
 * then enrich with symbol/name/logo from Jupiter's token list (if reachable). Token list
 * is cached in-module per session.
 *
 * Returns one entry per non-zero token account so the UI's TokenPicker can render a
 * meaningful list. SOL is added as a synthetic entry from getBalance().
 */

import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

export interface TokenBalance {
  mint: string;
  owner: string;
  /** atomic units (lamports for SOL, raw token units for SPL) */
  amount: string;
  decimals: number;
  /** Human-friendly amount, e.g. "12.345" */
  uiAmount: string;
  /** Best-effort metadata */
  symbol?: string;
  name?: string;
  logoURI?: string;
  /** Token-2022 vs Token */
  programId: string;
}

interface JupiterTokenListEntry {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

let _tokenListCache: Map<string, JupiterTokenListEntry> | null = null;

/**
 * Fetch + cache Jupiter's strict token list for symbol/logo enrichment.
 * Falls back to an empty map on network failure.
 */
async function getTokenList(): Promise<Map<string, JupiterTokenListEntry>> {
  if (_tokenListCache) return _tokenListCache;
  try {
    const res = await fetch("https://lite-api.jup.ag/tokens/v1/tagged/verified", {
      cache: "force-cache",
    });
    if (!res.ok) {
      _tokenListCache = new Map();
      return _tokenListCache;
    }
    const list = (await res.json()) as JupiterTokenListEntry[];
    _tokenListCache = new Map(list.map((t) => [t.address, t]));
    return _tokenListCache;
  } catch {
    _tokenListCache = new Map();
    return _tokenListCache;
  }
}

/**
 * List the user's non-zero SPL balances + native SOL. Sorted by USD-relevance proxy:
 * USDC first, then by atomic amount desc.
 */
export async function listUserTokenBalances(
  connection: Connection,
  owner: PublicKey,
): Promise<TokenBalance[]> {
  const tokenList = await getTokenList();

  // Parse native SOL via getBalance
  const lamports = await connection.getBalance(owner, "confirmed");
  const sol: TokenBalance = {
    mint: NATIVE_SOL_MINT,
    owner: owner.toBase58(),
    amount: String(lamports),
    decimals: 9,
    uiAmount: (lamports / LAMPORTS_PER_SOL).toFixed(4),
    symbol: "SOL",
    name: "Solana",
    programId: "11111111111111111111111111111111",
  };

  // Pull both Token + Token-2022 accounts
  const [tokens, token22] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
    connection
      .getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID })
      .catch(() => ({ value: [] })),
  ]);

  const all = [
    ...tokens.value.map((v) => ({ ...v, programId: TOKEN_PROGRAM_ID.toBase58() })),
    ...token22.value.map((v) => ({ ...v, programId: TOKEN_2022_PROGRAM_ID.toBase58() })),
  ];

  const splBalances: TokenBalance[] = all
    .map((entry) => {
      const info = entry.account.data.parsed?.info;
      if (!info) return null;
      const amount = String(info.tokenAmount?.amount ?? "0");
      const decimals = Number(info.tokenAmount?.decimals ?? 0);
      const uiAmount = String(info.tokenAmount?.uiAmountString ?? info.tokenAmount?.uiAmount ?? "0");
      if (amount === "0") return null;
      const mint = info.mint as string;
      const meta = tokenList.get(mint);
      return {
        mint,
        owner: owner.toBase58(),
        amount,
        decimals,
        uiAmount,
        ...(meta?.symbol ? { symbol: meta.symbol } : {}),
        ...(meta?.name ? { name: meta.name } : {}),
        ...(meta?.logoURI ? { logoURI: meta.logoURI } : {}),
        programId: entry.programId,
      } as TokenBalance;
    })
    .filter((x): x is TokenBalance => x !== null);

  // Sort: USDC first, then by amount desc, SOL last (most users keep SOL for fees, not for spending)
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet" ? "mainnet" : "devnet";
  const usdcMint =
    cluster === "mainnet"
      ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      : "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

  splBalances.sort((a, b) => {
    if (a.mint === usdcMint) return -1;
    if (b.mint === usdcMint) return 1;
    const aA = BigInt(a.amount);
    const bA = BigInt(b.amount);
    if (aA > bA) return -1;
    if (aA < bA) return 1;
    return 0;
  });

  return [...splBalances, sol];
}
