/**
 * Jupiter Lite API wrapper (F12).
 *
 * Documented at https://lite-api.jup.ag/swap/v1/. Two endpoints we use:
 *   GET  /quote                 — cluster-agnostic price quote, returns route plan
 *   POST /swap-instructions     — mainnet only; returns composable ix bundle for v0 tx
 *
 * Devnet caveat: Jupiter doesn't run a devnet aggregator (no DEX liquidity). Quote is
 * still useful as an informational price feed; swap-instructions only returns valid
 * routes on mainnet. The /api/swap/quote-and-build endpoint reflects this honestly to
 * callers via mode='mainnet_only' on devnet for non-USDC input.
 *
 * Auth: Lite API doesn't require an API key but is rate-limited to ~60 rpm per IP.
 * For production we'd add JUPITER_API_KEY via the paid Jupiter API at api.jup.ag.
 */

const JUPITER_LITE_BASE = process.env.JUPITER_API_BASE ?? "https://lite-api.jup.ag/swap/v1";

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot: number;
  timeTaken: number;
}

export interface JupiterSwapInstructionsResponse {
  computeBudgetInstructions: JupiterIx[];
  setupInstructions: JupiterIx[];
  swapInstruction: JupiterIx;
  cleanupInstruction: JupiterIx | null;
  addressLookupTableAddresses: string[];
  prioritizationFeeLamports?: number;
}

export interface JupiterIx {
  programId: string;
  accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  data: string; // base64
}

export class JupiterError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = "JupiterError";
  }
}

export interface QuoteParams {
  inputMint: string;
  outputMint: string;
  /** Atomic units of inputMint. */
  amount: string | bigint | number;
  slippageBps?: number;
  swapMode?: "ExactIn" | "ExactOut";
  onlyDirectRoutes?: boolean;
  restrictIntermediateTokens?: boolean;
}

/**
 * Get a price quote. Works on any cluster (it's just a quote — no execution).
 *
 * On devnet for non-mainnet token mints, Jupiter typically returns a 4xx because the
 * mints aren't in their token list. Catch + return null upstream so callers can switch
 * to "mainnet only" UX honestly.
 */
export async function getJupiterQuote(params: QuoteParams): Promise<JupiterQuoteResponse> {
  const search = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: String(params.amount),
    slippageBps: String(params.slippageBps ?? 50),
    swapMode: params.swapMode ?? "ExactIn",
    onlyDirectRoutes: String(params.onlyDirectRoutes ?? false),
    restrictIntermediateTokens: String(params.restrictIntermediateTokens ?? true),
  });

  const headers: Record<string, string> = {};
  if (process.env.JUPITER_API_KEY) headers["x-api-key"] = process.env.JUPITER_API_KEY;

  const res = await fetch(`${JUPITER_LITE_BASE}/quote?${search.toString()}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new JupiterError(
      `quote failed: ${res.status} ${res.statusText}`,
      res.status,
      raw,
    );
  }
  return (await res.json()) as JupiterQuoteResponse;
}

export interface SwapInstructionsParams {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
  /** Optional pre-existing destination ATA (skips create-ATA logic in setupInstructions). */
  destinationTokenAccount?: string;
  /** Wrap/unwrap SOL automatically. Default true. */
  wrapAndUnwrapSol?: boolean;
  dynamicComputeUnitLimit?: boolean;
  prioritizationFeeLamports?: number | { priorityLevelWithMaxLamports: { maxLamports: number; priorityLevel: "low" | "medium" | "high" } };
}

/**
 * Get the ix bundle for a swap. Mainnet only — devnet returns 4xx because the route
 * doesn't exist. Callers should detect that case via `JupiterError` and degrade UX.
 */
export async function getJupiterSwapInstructions(
  params: SwapInstructionsParams,
): Promise<JupiterSwapInstructionsResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.JUPITER_API_KEY) headers["x-api-key"] = process.env.JUPITER_API_KEY;

  const body: Record<string, unknown> = {
    quoteResponse: params.quoteResponse,
    userPublicKey: params.userPublicKey,
    wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
    dynamicComputeUnitLimit: params.dynamicComputeUnitLimit ?? true,
  };
  if (params.destinationTokenAccount) {
    body.destinationTokenAccount = params.destinationTokenAccount;
  }
  if (params.prioritizationFeeLamports) {
    body.prioritizationFeeLamports = params.prioritizationFeeLamports;
  }

  const res = await fetch(`${JUPITER_LITE_BASE}/swap-instructions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new JupiterError(
      `swap-instructions failed: ${res.status} ${res.statusText}`,
      res.status,
      raw,
    );
  }
  return (await res.json()) as JupiterSwapInstructionsResponse;
}

/** USDC mint addresses by cluster. */
export const USDC_MINTS = {
  mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
} as const;

export function isUsdcMint(mint: string, cluster: "mainnet" | "devnet"): boolean {
  return mint === USDC_MINTS[cluster];
}
