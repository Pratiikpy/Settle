/**
 * Reputation badge cron — auto-mints soulbound MPL Core badges when users
 * cross thresholds.
 *
 * Polls Postgres every BADGE_CRON_INTERVAL_MS (default 5 min). For each
 * eligible (user, badge_kind) pair NOT already in reputation_badges, calls
 * mintSoulboundBadge() to create the on-chain MPL Core asset, then inserts
 * the row.
 *
 * Idempotency: the unique (user_pubkey, badge_kind) constraint on the
 * reputation_badges table prevents double-mint. The cron pre-checks, mints,
 * inserts. If the insert fails on the unique constraint (race with another
 * cron instance) the row already exists; we just log + skip the mint we
 * just did (the asset is already on-chain — minor wasted rent, no double
 * record). Acceptable.
 *
 * Threshold definitions in code, not SQL — the SQL just stores results.
 *
 * Run: pnpm --filter @settle/indexer dev:badge-cron
 *
 * Required env:
 *   SETTLE_BADGE_AUTHORITY_PRIVKEY  base58 64-byte secret (badge minter)
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_RPC_URL  (or HELIUS_API_KEY)
 *
 * Optional:
 *   BADGE_CRON_INTERVAL_MS    default 300000 (5 min)
 *   SETTLE_CLUSTER            devnet | mainnet (default devnet)
 *   BADGE_CRON_DRY_RUN=1      compute candidates but don't actually mint
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { clusterApiUrl } from "@solana/web3.js";
import { ALL_BADGE_KINDS, BADGE_CATALOGUE, type BadgeKind } from "@settle/types";
import { buildBadgeAuthorityUmi, mintSoulboundBadge } from "./badges-mint.js";

config();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERVAL_MS = Number(process.env.BADGE_CRON_INTERVAL_MS ?? 300_000);
const CLUSTER = (process.env.SETTLE_CLUSTER ?? "devnet") as "devnet" | "mainnet";
const DRY_RUN = process.env.BADGE_CRON_DRY_RUN === "1";
const WEB_BASE = process.env.SETTLE_WEB_BASE ?? "http://localhost:3000";
const INTERNAL_KEY = process.env.SETTLE_INTERNAL_API_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[badge-cron] SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

if (!process.env.SETTLE_BADGE_AUTHORITY_PRIVKEY) {
  console.error(
    "[badge-cron] SETTLE_BADGE_AUTHORITY_PRIVKEY required. Generate via `pnpm badge:keygen`.",
  );
  process.exit(1);
}

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL ?? process.env.RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  if (heliusKey) return `https://${CLUSTER}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(CLUSTER === "mainnet" ? "mainnet-beta" : "devnet");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

async function postPushNotification(
  pubkey: string,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  if (!INTERNAL_KEY) return; // not configured → no-op (push is best-effort)
  const url = `${WEB_BASE}/api/internal/push`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INTERNAL_KEY}`,
    },
    body: JSON.stringify({ pubkey, payload }),
  });
}

interface UserCandidate {
  user_pubkey: string;
  badge_kind: BadgeKind;
}

/**
 * Compute eligible candidates for each badge kind. Each function returns the
 * list of user_pubkeys that have crossed the threshold. The cron then filters
 * out users who already have the badge.
 */
async function findFirstPayerCandidates(client: SupabaseClient): Promise<string[]> {
  // Anyone whose authority owns ≥1 ALLOW receipt. We resolve user_pubkey via
  // agent_cards.authority_pubkey for the receipt's card_pubkey.
  const { data, error } = await client
    .from("receipts")
    .select("card_pubkey")
    .eq("decision", "ALLOW")
    .limit(1000);
  if (error || !data) return [];
  return resolveAuthoritiesFromCardPubkeys(client, data.map((r) => r.card_pubkey as string));
}

async function findPolymathCandidates(client: SupabaseClient): Promise<string[]> {
  // Users whose authority's cards collectively touched 5+ distinct capability_hashes.
  const { data, error } = await client
    .from("receipts")
    .select("card_pubkey, capability_hash")
    .eq("decision", "ALLOW");
  if (error || !data) return [];

  // Group by card → set of capability_hashes
  const cardCaps = new Map<string, Set<string>>();
  for (const r of data) {
    const card = r.card_pubkey as string;
    const cap = String(r.capability_hash ?? "");
    if (!cap) continue;
    let s = cardCaps.get(card);
    if (!s) {
      s = new Set();
      cardCaps.set(card, s);
    }
    s.add(cap);
  }

  // Resolve cards → authorities, then dedupe by authority and require 5+ caps.
  const cardToAuth = await loadCardAuthorities(client, [...cardCaps.keys()]);
  const authToCaps = new Map<string, Set<string>>();
  for (const [card, caps] of cardCaps) {
    const auth = cardToAuth.get(card);
    if (!auth) continue;
    let s = authToCaps.get(auth);
    if (!s) {
      s = new Set();
      authToCaps.set(auth, s);
    }
    for (const c of caps) s.add(c);
  }
  return [...authToCaps.entries()]
    .filter(([, s]) => s.size >= 5)
    .map(([auth]) => auth);
}

async function findHighFrequencyOperatorCandidates(
  client: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await client
    .from("receipts")
    .select("card_pubkey")
    .eq("decision", "ALLOW");
  if (error || !data) return [];
  const cardCounts = new Map<string, number>();
  for (const r of data) {
    const card = r.card_pubkey as string;
    cardCounts.set(card, (cardCounts.get(card) ?? 0) + 1);
  }
  const cardToAuth = await loadCardAuthorities(client, [...cardCounts.keys()]);
  const authCounts = new Map<string, number>();
  for (const [card, c] of cardCounts) {
    const auth = cardToAuth.get(card);
    if (!auth) continue;
    authCounts.set(auth, (authCounts.get(auth) ?? 0) + c);
  }
  return [...authCounts.entries()]
    .filter(([, n]) => n >= 100)
    .map(([auth]) => auth);
}

async function findLongStreamerCandidates(
  client: SupabaseClient,
): Promise<string[]> {
  // Users with a streaming pact whose created_at is 30+ days ago and is still
  // not closed (i.e. has been ACTIVE for that period).
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("pacts")
    .select("parent_card, created_at, closed")
    .eq("mode", "streaming")
    .eq("closed", false)
    .lte("created_at", cutoff);
  if (error || !data) return [];
  const cardToAuth = await loadCardAuthorities(
    client,
    data.map((r) => r.parent_card as string),
  );
  const auths = new Set<string>();
  for (const r of data) {
    const auth = cardToAuth.get(r.parent_card as string);
    if (auth) auths.add(auth);
  }
  return [...auths];
}

async function findHonestDisputerCandidates(
  client: SupabaseClient,
): Promise<string[]> {
  // First successful dispute_delivery_escrow → pacts.refunded=true AND
  // mode='delivery_escrow'. Resolve via parent_card → authority.
  const { data, error } = await client
    .from("pacts")
    .select("parent_card")
    .eq("mode", "delivery_escrow")
    .eq("refunded", true);
  if (error || !data) return [];
  const cardToAuth = await loadCardAuthorities(
    client,
    data.map((r) => r.parent_card as string),
  );
  const auths = new Set<string>();
  for (const r of data) {
    const auth = cardToAuth.get(r.parent_card as string);
    if (auth) auths.add(auth);
  }
  return [...auths];
}

async function findPublicSpenderCandidates(
  client: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await client
    .from("receipts")
    .select("card_pubkey")
    .eq("decision", "ALLOW")
    .eq("public_feed", true);
  if (error || !data) return [];
  return resolveAuthoritiesFromCardPubkeys(
    client,
    data.map((r) => r.card_pubkey as string),
  );
}

async function loadCardAuthorities(
  client: SupabaseClient,
  cardPubkeys: string[],
): Promise<Map<string, string>> {
  if (cardPubkeys.length === 0) return new Map();
  const unique = [...new Set(cardPubkeys)];
  const { data } = await client
    .from("agent_cards")
    .select("card_pubkey, authority_pubkey")
    .in("card_pubkey", unique);
  return new Map((data ?? []).map((r) => [r.card_pubkey as string, r.authority_pubkey as string]));
}

async function resolveAuthoritiesFromCardPubkeys(
  client: SupabaseClient,
  cardPubkeys: string[],
): Promise<string[]> {
  const m = await loadCardAuthorities(client, cardPubkeys);
  return [...new Set([...m.values()])];
}

async function findCandidatesByKind(
  client: SupabaseClient,
  kind: BadgeKind,
): Promise<string[]> {
  switch (kind) {
    case "first_payer":
      return findFirstPayerCandidates(client);
    case "polymath":
      return findPolymathCandidates(client);
    case "high_frequency_operator":
      return findHighFrequencyOperatorCandidates(client);
    case "long_streamer":
      return findLongStreamerCandidates(client);
    case "honest_disputer":
      return findHonestDisputerCandidates(client);
    case "public_spender":
      return findPublicSpenderCandidates(client);
  }
}

async function findUnmintedCandidates(): Promise<UserCandidate[]> {
  const out: UserCandidate[] = [];
  for (const kind of ALL_BADGE_KINDS) {
    const eligibleAuths = await findCandidatesByKind(supabase, kind);
    if (eligibleAuths.length === 0) continue;

    // Filter out users who already have THIS badge kind.
    const { data: existing } = await supabase
      .from("reputation_badges")
      .select("user_pubkey")
      .eq("badge_kind", kind)
      .in("user_pubkey", eligibleAuths);
    const have = new Set((existing ?? []).map((r) => r.user_pubkey as string));

    for (const auth of eligibleAuths) {
      if (have.has(auth)) continue;
      out.push({ user_pubkey: auth, badge_kind: kind });
    }
  }
  return out;
}

async function tick(): Promise<void> {
  try {
    const candidates = await findUnmintedCandidates();
    if (candidates.length === 0) {
      console.log(`[badge-cron] no eligible candidates this tick.`);
      return;
    }
    console.log(`[badge-cron] ${candidates.length} candidates eligible.`);

    if (DRY_RUN) {
      for (const c of candidates) {
        console.log(`  [dry-run] would mint ${c.badge_kind} → ${c.user_pubkey.slice(0, 6)}…`);
      }
      return;
    }

    const umi = buildBadgeAuthorityUmi(getRpcUrl());

    // Mint serially so we don't blast the RPC + so the rare-badge order is
    // deterministic for demos.
    for (const c of candidates) {
      try {
        const result = await mintSoulboundBadge({
          umi,
          recipientPubkey: c.user_pubkey,
          badgeKind: c.badge_kind,
        });
        const { error: insErr } = await supabase.from("reputation_badges").insert({
          user_pubkey: c.user_pubkey,
          badge_kind: c.badge_kind,
          asset_address: result.asset_address,
          metadata_uri: result.metadata_uri,
          sig_solscan: result.signature,
        });
        if (insErr && !insErr.message.toLowerCase().includes("duplicate")) {
          console.warn(
            `[badge-cron] DB insert failed (asset on-chain at ${result.asset_address}): ${insErr.message}`,
          );
        }
        console.log(
          `[badge-cron] minted ${c.badge_kind} → ${c.user_pubkey.slice(0, 6)}… (asset ${result.asset_address.slice(0, 6)}…)`,
        );

        // Best-effort push notification — HTTP-indirected to the web app
        // (matches escrow-cron's pattern: web app owns VAPID + RFC 8291 logic
        // so we don't fan out crypto code across services).
        const spec = BADGE_CATALOGUE[c.badge_kind];
        await postPushNotification(c.user_pubkey, {
          title: `🏆 You earned: ${spec.name}`,
          body: spec.description.slice(0, 120),
          url: `/at/${c.user_pubkey}`,
        }).catch(() => {});
      } catch (e) {
        console.warn(
          `[badge-cron] mint failed for ${c.badge_kind} → ${c.user_pubkey.slice(0, 6)}…: ${(e as Error).message}`,
        );
      }
    }
  } catch (e) {
    console.warn(`[badge-cron] tick failed: ${(e as Error).message}`);
  }
}

console.log(
  `[badge-cron] online · cluster=${CLUSTER} · interval=${INTERVAL_MS}ms${DRY_RUN ? " · DRY-RUN" : ""}`,
);

void tick();
setInterval(() => void tick(), INTERVAL_MS);
