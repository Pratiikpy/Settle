/**
 * Preflight check status mapping.
 *
 * Pure functions that map raw env / probe values to the green/yellow/red
 * status the /api/preflight endpoint reports. Extracted into the SDK so
 * the deterministic logic can be unit-tested without spinning up a Next
 * route handler — same pattern as `parseIntentRegex`.
 *
 * The route handler at apps/web/app/api/preflight/route.ts wires these
 * to actual env reads + RPC pings; that's the IO layer, not tested here.
 */

export type CheckStatus = "green" | "yellow" | "red";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  hint: string;
}

/** SETTLE_RELAYER_PRIVKEY → green (set + decodes) | yellow (unset) | red (decode fails). */
export function relayerStatus(args: {
  privkeyB58: string | undefined;
  decodedPubkey: string | null;
  decodeError: string | null;
}): CheckResult {
  if (!args.privkeyB58) {
    return {
      name: "Relayer keypair",
      status: "yellow",
      hint: "SETTLE_RELAYER_PRIVKEY not set — Phase 5 fires stay in dry-run mode.",
    };
  }
  if (args.decodeError || !args.decodedPubkey) {
    return {
      name: "Relayer keypair",
      status: "red",
      hint: `Decode failed — invalid base58 secret. (${args.decodeError ?? "unknown"})`,
    };
  }
  return {
    name: "Relayer keypair",
    status: "green",
    hint: `Loaded: ${args.decodedPubkey}`,
  };
}

/** SETTLE_RELAYER_LIVE flag check. */
export function liveModeStatus(envFlag: string | undefined): CheckResult {
  const live = envFlag === "true";
  return {
    name: "Live mode",
    status: live ? "green" : "yellow",
    hint: live
      ? "SETTLE_RELAYER_LIVE=true — signer fires real txs."
      : "Dry-run only. Flip SETTLE_RELAYER_LIVE=true after inspecting audit rows for a few cron cycles.",
  };
}

/** CRON_SECRET length + presence check. */
export function cronSecretStatus(secret: string | undefined): CheckResult {
  if (!secret) {
    return {
      name: "Cron secret",
      status: "red",
      hint: "CRON_SECRET not set — Vercel cron requests will be rejected.",
    };
  }
  if (secret.length < 16) {
    return {
      name: "Cron secret",
      status: "yellow",
      hint: "CRON_SECRET is short. Use ≥ 32 random hex chars.",
    };
  }
  return { name: "Cron secret", status: "green", hint: "Configured." };
}

/** SETTLE_WEBHOOK_SIGNING_SECRET presence check. */
export function webhookSigningStatus(secret: string | undefined): CheckResult {
  if (!secret) {
    return {
      name: "Webhook signing",
      status: "yellow",
      hint: "SETTLE_WEBHOOK_SIGNING_SECRET unset — webhook payloads will be unsigned.",
    };
  }
  return { name: "Webhook signing", status: "green", hint: "Signing secret present." };
}

/**
 * Aggregate counts across an array of checks. Used by the UI's hero
 * band to show "5 green / 2 yellow / 0 red".
 */
export function summarizeChecks(checks: ReadonlyArray<CheckResult>): {
  green: number;
  yellow: number;
  red: number;
  ok: boolean;
} {
  const counts = { green: 0, yellow: 0, red: 0 };
  for (const c of checks) counts[c.status] += 1;
  return { ...counts, ok: counts.red === 0 };
}
