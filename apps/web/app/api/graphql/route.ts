import { NextRequest, NextResponse } from "next/server";
import { buildSchema, graphql } from "graphql";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F5.10 — Read-only GraphQL surface.
 *
 * Why read-only: writes go through dedicated REST endpoints with their
 * own auth + idempotency middleware (Stripe-shaped webhook envelope,
 * Idempotency-Key on POSTs). Putting writes behind GraphQL would
 * recreate that infrastructure, which is the wrong trade — REST is
 * better for state-mutation, GraphQL is better for read shaping.
 *
 * The schema covers only public-safe fields. Sealed-box ciphertext,
 * card-balance internals, and refund-decision details stay REST-only.
 *
 * Endpoint: POST /api/graphql with `{ query: string, variables?: object }`.
 * GET also supported with `?query=...&variables=...` for tooling.
 */

const schema = buildSchema(/* GraphQL */ `
  scalar JSON
  scalar DateTime

  type Receipt {
    request_id: ID!
    kind: String
    amount_lamports: String!
    sender_pubkey: String
    recipient_pubkey: String
    merchant_pubkey: String
    card_pubkey: String
    decision: String
    narration_text: String
    created_at: DateTime!
    bookkeeper_category: String
  }

  type Card {
    card_pubkey: ID!
    authority_pubkey: String!
    daily_cap_lamports: String!
    created_at: DateTime!
  }

  type Handle {
    handle: ID!
    pubkey: String!
    display_name: String
    sns_domain: String
    created_at: DateTime!
  }

  type RefundRequest {
    request_id: ID!
    reason: String
    emoji: String
    decision: String
    created_at: DateTime!
  }

  type Query {
    """Look up a receipt by its request_id."""
    receipt(request_id: ID!): Receipt

    """Recent receipts addressed to a wallet (sender or recipient)."""
    receiptsForWallet(pubkey: String!, limit: Int = 25): [Receipt!]!

    """Recent receipts addressed to a merchant."""
    receiptsForMerchant(merchant_pubkey: String!, limit: Int = 25): [Receipt!]!

    """Resolve a handle string → wallet metadata."""
    handle(handle: String!): Handle

    """List handles claimed by a pubkey."""
    handlesForPubkey(pubkey: String!): [Handle!]!

    """Refund requests for a receipt."""
    refundsForReceipt(request_id: ID!): [RefundRequest!]!
  }
`);

function getSb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const RECEIPT_FIELDS =
  "request_id, receipt_kind, amount_lamports, sender_pubkey, recipient_pubkey, merchant_pubkey, card_pubkey, decision, narration_text, created_at, bookkeeper_category";

function mapReceipt(r: Record<string, unknown>) {
  return {
    request_id: r.request_id,
    kind: r.receipt_kind,
    amount_lamports: r.amount_lamports,
    sender_pubkey: r.sender_pubkey,
    recipient_pubkey: r.recipient_pubkey,
    merchant_pubkey: r.merchant_pubkey,
    card_pubkey: r.card_pubkey,
    decision: r.decision,
    narration_text: r.narration_text,
    created_at: r.created_at,
    bookkeeper_category: r.bookkeeper_category,
  };
}

function buildRoot() {
  const sb = getSb();
  if (!sb) throw new Error("supabase_unconfigured");
  return {
    receipt: async ({ request_id }: { request_id: string }) => {
      const { data } = await sb
        .from("receipts")
        .select(RECEIPT_FIELDS)
        .eq("request_id", request_id)
        .maybeSingle();
      return data ? mapReceipt(data) : null;
    },
    receiptsForWallet: async ({ pubkey, limit }: { pubkey: string; limit: number }) => {
      // Bug #37 (= Bug #10 in GraphQL): public.receipts has no
      // sender_pubkey / recipient_pubkey — only card_pubkey (sender for
      // direct_send) and merchant_pubkey (recipient). The previous
      // .or() filter referenced columns that don't exist, so PostgREST
      // 400'd, the destructure swallowed the error, and `data ?? []`
      // returned empty. Use card/merchant column names.
      const { data, error } = await sb
        .from("receipts")
        .select(RECEIPT_FIELDS)
        .or(`card_pubkey.eq.${pubkey},merchant_pubkey.eq.${pubkey}`)
        .order("created_at", { ascending: false })
        .limit(Math.min(limit ?? 25, 100));
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[graphql.receiptsForWallet]", error.message);
      }
      return (data ?? []).map(mapReceipt);
    },
    receiptsForMerchant: async ({
      merchant_pubkey,
      limit,
    }: {
      merchant_pubkey: string;
      limit: number;
    }) => {
      const { data } = await sb
        .from("receipts")
        .select(RECEIPT_FIELDS)
        .eq("merchant_pubkey", merchant_pubkey)
        .order("created_at", { ascending: false })
        .limit(Math.min(limit ?? 25, 100));
      return (data ?? []).map(mapReceipt);
    },
    handle: async ({ handle }: { handle: string }) => {
      const { data } = await sb
        .from("handles")
        .select("handle, pubkey, display_name, sns_domain, created_at")
        .eq("handle", handle.toLowerCase())
        .maybeSingle();
      return data;
    },
    handlesForPubkey: async ({ pubkey }: { pubkey: string }) => {
      const { data } = await sb
        .from("handles")
        .select("handle, pubkey, display_name, sns_domain, created_at")
        .eq("pubkey", pubkey);
      return data ?? [];
    },
    refundsForReceipt: async ({ request_id }: { request_id: string }) => {
      const { data } = await sb
        .from("refund_requests")
        .select("request_id, reason, emoji, decision, created_at")
        .eq("request_id", request_id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  };
}

async function executeQuery(query: string, variables: Record<string, unknown> | undefined) {
  let root: ReturnType<typeof buildRoot>;
  try {
    root = buildRoot();
  } catch (e) {
    return NextResponse.json({ errors: [{ message: (e as Error).message }] }, { status: 503 });
  }
  const result = await graphql({
    schema,
    source: query,
    rootValue: root,
    variableValues: variables,
  });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  let body: { query?: string; variables?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errors: [{ message: "invalid_json" }] }, { status: 400 });
  }
  if (!body.query) {
    return NextResponse.json({ errors: [{ message: "query_required" }] }, { status: 400 });
  }
  return executeQuery(body.query, body.variables);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const query = url.searchParams.get("query");
  const variablesRaw = url.searchParams.get("variables");
  if (!query) {
    return NextResponse.json({ errors: [{ message: "query_required" }] }, { status: 400 });
  }
  let variables: Record<string, unknown> | undefined;
  if (variablesRaw) {
    try {
      variables = JSON.parse(variablesRaw);
    } catch {
      return NextResponse.json(
        { errors: [{ message: "invalid_variables_json" }] },
        { status: 400 },
      );
    }
  }
  return executeQuery(query, variables);
}
