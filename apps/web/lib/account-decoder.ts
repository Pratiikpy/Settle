/**
 * On-chain account decoders for the settle-agent-card program.
 *
 * Anchor account layout: [8-byte discriminator] [borsh-encoded struct].
 * Discriminator = sha256("account:<TypeName>")[0..8].
 *
 * Reverses the Rust struct definitions in
 *   programs/settle-agent-card/src/state.rs
 *
 * Keep byte-aligned with that file. AllowlistEntry is shared between AgentCard
 * and Pact in v0.2.0.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha2";
import { BorshReader } from "./borsh-reader";

function accountDiscriminator(name: string): Buffer {
  return Buffer.from(sha256(new TextEncoder().encode(`account:${name}`)).slice(0, 8));
}

const AGENT_CARD_DISC = accountDiscriminator("AgentCard");
const PACT_DISC = accountDiscriminator("Pact");

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

export interface AllowlistEntry {
  merchant: PublicKey;
  capabilityHash: Buffer | null; // 32 bytes if Some
}

function readAllowlistEntry(rr: BorshReader): AllowlistEntry {
  return {
    merchant: new PublicKey(rr.fixedBytes(32)),
    capabilityHash: rr.option((r2) => r2.fixedBytes(32)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AgentCard
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentCardAccount {
  authority: PublicKey;
  agentPubkey: PublicKey;
  labelHash: Buffer;
  usdcMint: PublicKey;
  dailyCapLamports: bigint;
  perCallMaxLamports: bigint;
  usedToday: bigint;
  lastResetSlot: bigint;
  allowlist: AllowlistEntry[];
  expirySlot: bigint;
  revoked: boolean;
  policyVersion: number;
  createdAt: bigint;
  bump: number;
}

export function decodeAgentCard(data: Buffer): AgentCardAccount {
  if (data.length < 8) throw new Error("AgentCard: account too short");
  if (!data.subarray(0, 8).equals(AGENT_CARD_DISC)) {
    throw new Error("AgentCard: discriminator mismatch");
  }

  const r = new BorshReader(data, 8);

  const authority = new PublicKey(r.fixedBytes(32));
  const agentPubkey = new PublicKey(r.fixedBytes(32));
  const labelHash = r.fixedBytes(32);
  const usdcMint = new PublicKey(r.fixedBytes(32));
  const dailyCapLamports = r.u64();
  const perCallMaxLamports = r.u64();
  const usedToday = r.u64();
  const lastResetSlot = r.u64();
  const allowlist = r.vec(readAllowlistEntry);
  const expirySlot = r.u64();
  const revoked = r.bool();
  const policyVersion = r.u32();
  const createdAt = r.i64();
  const bump = r.u8();

  return {
    authority,
    agentPubkey,
    labelHash,
    usdcMint,
    dailyCapLamports,
    perCallMaxLamports,
    usedToday,
    lastResetSlot,
    allowlist,
    expirySlot,
    revoked,
    policyVersion,
    createdAt,
    bump,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pact
//
// v0.3 introduces PactMode (OneShot | Streaming). Anchor enum encoding is a
// 1-byte variant index followed by the variant payload. We expose the mode as a
// discriminated union for type-safe consumer surfaces.
// ─────────────────────────────────────────────────────────────────────────────

export type PactMode =
  | {
      kind: "oneShot";
      capLamports: bigint;
      spent: bigint;
    }
  | {
      kind: "streaming";
      rateLamportsPerSlot: bigint;
      maxTotalLamports: bigint;
      claimed: bigint;
      lastClaimSlot: bigint;
      paused: boolean;
      pauseStartedSlot: bigint;
      pauseAccumulatedSlots: bigint;
    }
  | {
      kind: "deliveryEscrow";
      amount: bigint;
      merchant: PublicKey;
      capabilityHash: Buffer;
      confirmDeadlineSlot: bigint;
      disputeDeadlineSlot: bigint;
      released: boolean;
      refunded: boolean;
    };

export interface PactAccount {
  parentCard: PublicKey;
  authority: PublicKey;
  agentPubkey: PublicKey;
  scopeLabelHash: Buffer;
  usdcMint: PublicKey;
  mode: PactMode;
  allowlist: AllowlistEntry[];
  expirySlot: bigint;
  closed: boolean;
  createdAt: bigint;
  bump: number;
  vaultBump: number;
}

function readPactMode(r: BorshReader): PactMode {
  const variant = r.u8();
  if (variant === 0) {
    const capLamports = r.u64();
    const spent = r.u64();
    return { kind: "oneShot", capLamports, spent };
  }
  if (variant === 1) {
    const rateLamportsPerSlot = r.u64();
    const maxTotalLamports = r.u64();
    const claimed = r.u64();
    const lastClaimSlot = r.u64();
    const paused = r.bool();
    const pauseStartedSlot = r.u64();
    const pauseAccumulatedSlots = r.u64();
    return {
      kind: "streaming",
      rateLamportsPerSlot,
      maxTotalLamports,
      claimed,
      lastClaimSlot,
      paused,
      pauseStartedSlot,
      pauseAccumulatedSlots,
    };
  }
  if (variant === 2) {
    const amount = r.u64();
    const merchant = new PublicKey(r.fixedBytes(32));
    const capabilityHash = r.fixedBytes(32);
    const confirmDeadlineSlot = r.u64();
    const disputeDeadlineSlot = r.u64();
    const released = r.bool();
    const refunded = r.bool();
    return {
      kind: "deliveryEscrow",
      amount,
      merchant,
      capabilityHash,
      confirmDeadlineSlot,
      disputeDeadlineSlot,
      released,
      refunded,
    };
  }
  throw new Error(`Pact: unknown PactMode variant ${variant}`);
}

export function decodePact(data: Buffer): PactAccount {
  if (data.length < 8) throw new Error("Pact: account too short");
  if (!data.subarray(0, 8).equals(PACT_DISC)) {
    throw new Error("Pact: discriminator mismatch");
  }

  const r = new BorshReader(data, 8);

  const parentCard = new PublicKey(r.fixedBytes(32));
  const authority = new PublicKey(r.fixedBytes(32));
  const agentPubkey = new PublicKey(r.fixedBytes(32));
  const scopeLabelHash = r.fixedBytes(32);
  const usdcMint = new PublicKey(r.fixedBytes(32));
  const mode = readPactMode(r);
  const allowlist = r.vec(readAllowlistEntry);
  const expirySlot = r.u64();
  const closed = r.bool();
  const createdAt = r.i64();
  const bump = r.u8();
  const vaultBump = r.u8();

  return {
    parentCard,
    authority,
    agentPubkey,
    scopeLabelHash,
    usdcMint,
    mode,
    allowlist,
    expirySlot,
    closed,
    createdAt,
    bump,
    vaultBump,
  };
}

/**
 * Helpers to project a PactMode into a single-axis "remaining/used" view —
 * useful for UI surfaces that just want to render a progress bar without
 * branching on mode in three places.
 */
export function pactSpent(mode: PactMode): bigint {
  switch (mode.kind) {
    case "oneShot":
      return mode.spent;
    case "streaming":
      return mode.claimed;
    case "deliveryEscrow":
      // For escrow, "spent" means "delivered to merchant" = full amount once released.
      return mode.released ? mode.amount : 0n;
  }
}

export function pactBudget(mode: PactMode): bigint {
  switch (mode.kind) {
    case "oneShot":
      return mode.capLamports;
    case "streaming":
      return mode.maxTotalLamports;
    case "deliveryEscrow":
      return mode.amount;
  }
}

export function pactRemaining(mode: PactMode): bigint {
  return pactBudget(mode) - pactSpent(mode);
}

// ─────────────────────────────────────────────────────────────────────────────
// RPC fetchers
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAgentCard(
  connection: Connection,
  pubkey: PublicKey,
): Promise<AgentCardAccount | null> {
  const info = await connection.getAccountInfo(pubkey, "confirmed");
  if (!info) return null;
  return decodeAgentCard(Buffer.from(info.data));
}

export async function fetchPact(
  connection: Connection,
  pubkey: PublicKey,
): Promise<PactAccount | null> {
  const info = await connection.getAccountInfo(pubkey, "confirmed");
  if (!info) return null;
  return decodePact(Buffer.from(info.data));
}

// ─────────────────────────────────────────────────────────────────────────────
// Live policy check
// ─────────────────────────────────────────────────────────────────────────────

import { DenyCode, type DenyCodeValue } from "@settle/sdk";

export interface LivePolicyCheckInput {
  card: AgentCardAccount;
  pact?: PactAccount | null;
  merchant: PublicKey;
  amountLamports: bigint;
  capabilityHashHex: string;
  currentSlot: bigint;
}

export interface LivePolicyResult {
  denyCode: DenyCodeValue | null;
  reason: string | null;
  capRemainingAfter: bigint;
}

export function checkLivePolicy(input: LivePolicyCheckInput): LivePolicyResult {
  const { card, pact, merchant, amountLamports, capabilityHashHex, currentSlot } = input;

  if (card.revoked) {
    return { denyCode: DenyCode.Revoked, reason: "card revoked", capRemainingAfter: 0n };
  }
  if (currentSlot >= card.expirySlot) {
    return { denyCode: DenyCode.Expired, reason: "card expired", capRemainingAfter: 0n };
  }
  if (amountLamports > card.perCallMaxLamports) {
    return {
      denyCode: DenyCode.OverCap,
      reason: `amount ${amountLamports} exceeds per_call_max ${card.perCallMaxLamports}`,
      capRemainingAfter: 0n,
    };
  }

  const CAP_WINDOW_SLOTS = 220_000n;
  const usedToday =
    currentSlot - card.lastResetSlot >= CAP_WINDOW_SLOTS ? 0n : card.usedToday;
  const newTotal = usedToday + amountLamports;
  if (newTotal > card.dailyCapLamports) {
    return {
      denyCode: DenyCode.OverCap,
      reason: `would exceed daily_cap (${usedToday} + ${amountLamports} > ${card.dailyCapLamports})`,
      capRemainingAfter: 0n,
    };
  }

  const merchantStr = merchant.toBase58();
  const allowEntry = card.allowlist.find((e) => e.merchant.toBase58() === merchantStr);
  if (!allowEntry) {
    return {
      denyCode: DenyCode.OffAllowlist,
      reason: `merchant ${merchantStr.slice(0, 6)}… not in card allowlist`,
      capRemainingAfter: 0n,
    };
  }
  if (allowEntry.capabilityHash) {
    const expected = allowEntry.capabilityHash.toString("hex");
    if (expected.toLowerCase() !== capabilityHashHex.toLowerCase()) {
      return {
        denyCode: DenyCode.CapabilityNotPinned,
        reason: `capability_hash does not match pinned hash on card`,
        capRemainingAfter: 0n,
      };
    }
  }

  if (pact) {
    if (pact.closed) {
      return { denyCode: DenyCode.Revoked, reason: "pact closed", capRemainingAfter: 0n };
    }
    if (currentSlot >= pact.expirySlot) {
      return { denyCode: DenyCode.Expired, reason: "pact expired", capRemainingAfter: 0n };
    }
    // Mode-aware cap check. OneShot uses cap_lamports/spent; Streaming bounds by
    // max_total_lamports - claimed (the pre-flight checker only needs the bound;
    // per-slot accrual is computed at claim time on-chain).
    const pactSpentVal = pactSpent(pact.mode);
    const pactBudgetVal = pactBudget(pact.mode);
    const pactNewTotal = pactSpentVal + amountLamports;
    if (pactNewTotal > pactBudgetVal) {
      return {
        denyCode: DenyCode.OverCap,
        reason: `pact cap exceeded (${pactSpentVal} + ${amountLamports} > ${pactBudgetVal})`,
        capRemainingAfter: 0n,
      };
    }
    const pactEntry = pact.allowlist.find((e) => e.merchant.toBase58() === merchantStr);
    if (!pactEntry) {
      return {
        denyCode: DenyCode.OffAllowlist,
        reason: `merchant ${merchantStr.slice(0, 6)}… not in pact allowlist`,
        capRemainingAfter: 0n,
      };
    }
    if (pactEntry.capabilityHash) {
      const expected = pactEntry.capabilityHash.toString("hex");
      if (expected.toLowerCase() !== capabilityHashHex.toLowerCase()) {
        return {
          denyCode: DenyCode.CapabilityNotPinned,
          reason: `capability_hash does not match pinned hash on pact`,
          capRemainingAfter: 0n,
        };
      }
    }
  }

  return {
    denyCode: null,
    reason: null,
    capRemainingAfter: card.dailyCapLamports - newTotal,
  };
}
