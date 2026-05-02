import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/group-accounts/[group_id]/requests
 *
 * Returns group_spend_requests for the group + per-request approval
 * tally. Used by the groups UI to show pending votes.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RequestRow {
  request_id: string;
  requester_pubkey: string;
  dest_pubkey: string;
  amount_lamports: string;
  pact_pubkey: string;
  status: "pending" | "quorum_met" | "fired" | "cancelled" | "expired";
  signature: string | null;
  note: string | null;
  created_at: string;
  fired_at: string | null;
  expires_at: string;
  approvals: number;
  denials: number;
  voters: Array<{ member_pubkey: string; decision: "approve" | "deny" }>;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ group_id: string }> },
) {
  const { group_id } = await params;
  if (!UUID_RE.test(group_id)) {
    return NextResponse.json({ error: "invalid_group_id" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: requests } = await sb
    .from("group_spend_requests")
    .select(
      "request_id, requester_pubkey, dest_pubkey, amount_lamports, pact_pubkey, status, signature, note, created_at, fired_at, expires_at",
    )
    .eq("group_id", group_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!requests || requests.length === 0) {
    return NextResponse.json({ ok: true, requests: [] });
  }

  const requestIds = requests.map((r) => r.request_id);
  const { data: approvals } = await sb
    .from("group_spend_approvals")
    .select("request_id, member_pubkey, decision")
    .in("request_id", requestIds);

  const tally = new Map<
    string,
    { approvals: number; denials: number; voters: RequestRow["voters"] }
  >();
  for (const a of approvals ?? []) {
    const t = tally.get(a.request_id) ?? {
      approvals: 0,
      denials: 0,
      voters: [],
    };
    if (a.decision === "approve") t.approvals += 1;
    else t.denials += 1;
    t.voters.push({
      member_pubkey: a.member_pubkey,
      decision: a.decision as "approve" | "deny",
    });
    tally.set(a.request_id, t);
  }

  const enriched: RequestRow[] = requests.map((r) => {
    const t = tally.get(r.request_id) ?? {
      approvals: 0,
      denials: 0,
      voters: [],
    };
    return {
      request_id: r.request_id,
      requester_pubkey: r.requester_pubkey,
      dest_pubkey: r.dest_pubkey,
      amount_lamports: String(r.amount_lamports),
      pact_pubkey: r.pact_pubkey,
      status: r.status as RequestRow["status"],
      signature: r.signature,
      note: r.note,
      created_at: r.created_at,
      fired_at: r.fired_at,
      expires_at: r.expires_at,
      approvals: t.approvals,
      denials: t.denials,
      voters: t.voters,
    };
  });

  return NextResponse.json({ ok: true, requests: enriched });
}
