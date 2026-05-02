import { NextRequest, NextResponse } from "next/server";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F7.8 — Group spend approval (N-of-M off-chain quorum).
 *
 *   POST /api/group-accounts/approve
 *     {
 *       group_id, request_id, member_pubkey,
 *       amount_lamports, dest_pubkey,
 *       decision: "approve" | "deny",
 *       signature_b58
 *     }
 *
 * Member signs `settle:group-spend:<group_id>:<request_id>:<amount>:<dest>:<decision>`.
 * We verify the Ed25519 sig, confirm the member is a `voter` in the
 * group, and record the approval. Once `approve` count >= group.quorum,
 * we write a relayer-fire intent into phase5_executions with
 * intent_kind='group_spend'. The signer cron picks it up.
 *
 * One approval row per (request_id, member_pubkey) — the schema's
 * UNIQUE constraint enforces this, so we don't have to worry about
 * a member double-voting and inflating the count.
 *
 * Why off-chain: the on-chain Pact has a single `authority_pubkey`. We
 * preserve that by having the custodian (the on-chain authority) be
 * the only wallet that can fire the spend, BUT only after the
 * off-chain quorum has signed. Reverse-side: a corrupted custodian who
 * tries to fire without quorum will land tx on-chain but the intent
 * row never gets the "quorum_met" status, so the audit will flag it.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{86,90}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Body = z.object({
  group_id: z.string().regex(UUID_RE),
  request_id: z.string().regex(UUID_RE),
  member_pubkey: z.string().regex(PUBKEY_RE),
  amount_lamports: z.string().regex(/^\d+$/),
  dest_pubkey: z.string().regex(PUBKEY_RE),
  decision: z.enum(["approve", "deny"]),
  signature_b58: z.string().regex(SIG_RE),
});

function getSb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const v = parsed.data;
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  // 1. Confirm group exists + lookup the request row (post-C48).
  const { data: group } = await sb
    .from("group_accounts")
    .select(
      "group_id, custodian_pubkey, holding_card, quorum, threshold_lamports, label",
    )
    .eq("group_id", v.group_id)
    .maybeSingle();
  if (!group) {
    return NextResponse.json({ error: "group_not_found" }, { status: 404 });
  }

  // Look up the request — we now require it to exist (created via
  // /api/group-accounts/request-spend) so the Pact is pre-spawned and
  // approvals are voting on a known artifact rather than a speculative
  // (group, dest, amount) triple.
  const { data: requestRow } = await sb
    .from("group_spend_requests")
    .select(
      "request_id, group_id, dest_pubkey, amount_lamports, pact_pubkey, status",
    )
    .eq("request_id", v.request_id)
    .maybeSingle();
  if (!requestRow) {
    return NextResponse.json(
      {
        error: "request_not_found",
        hint: "Custodian must call /api/group-accounts/request-spend first to create the request + spawn its Pact.",
      },
      { status: 404 },
    );
  }
  if (requestRow.group_id !== v.group_id) {
    return NextResponse.json(
      { error: "request_group_mismatch" },
      { status: 400 },
    );
  }
  if (
    requestRow.dest_pubkey !== v.dest_pubkey ||
    String(requestRow.amount_lamports) !== v.amount_lamports
  ) {
    // Members signed an attestation over (request, amount, dest) — if
    // those don't match the canonical request row, the sig isn't
    // authorizing what we think.
    return NextResponse.json(
      {
        error: "vote_mismatch",
        message:
          "amount or dest in your vote doesn't match the canonical request — refresh and re-sign.",
      },
      { status: 400 },
    );
  }
  if (requestRow.status !== "pending" && requestRow.status !== "quorum_met") {
    return NextResponse.json(
      { error: "request_closed", status: requestRow.status },
      { status: 409 },
    );
  }

  // 2. Confirm member is a VOTER (not just viewer).
  const { data: member } = await sb
    .from("group_account_members")
    .select("role")
    .eq("group_id", v.group_id)
    .eq("member_pubkey", v.member_pubkey)
    .maybeSingle();
  if (!member) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }
  if (member.role !== "voter") {
    return NextResponse.json(
      { error: "not_a_voter", member_role: member.role },
      { status: 403 },
    );
  }

  // 3. Verify signature.
  const message = `settle:group-spend:${v.group_id}:${v.request_id}:${v.amount_lamports}:${v.dest_pubkey}:${v.decision}`;
  let sigOk = false;
  try {
    sigOk = ed25519.verify(
      bs58.decode(v.signature_b58),
      new TextEncoder().encode(message),
      bs58.decode(v.member_pubkey),
    );
  } catch {
    sigOk = false;
  }
  if (!sigOk) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  // 4. Insert approval. UNIQUE(request_id, member_pubkey) enforces no
  //    double-voting; if the row already exists, we return 409.
  const { error: insErr } = await sb.from("group_spend_approvals").insert({
    group_id: v.group_id,
    request_id: v.request_id,
    member_pubkey: v.member_pubkey,
    signature_b58: v.signature_b58,
    decision: v.decision,
  });
  if (insErr) {
    if (insErr.code === "23505") {
      return NextResponse.json(
        { error: "already_voted", message: "this member already voted on this request" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "insert_failed", detail: insErr.message }, { status: 500 });
  }

  // 5. Count approvals + denies for this request.
  const { data: tally } = await sb
    .from("group_spend_approvals")
    .select("decision")
    .eq("request_id", v.request_id);
  const approvals = (tally ?? []).filter((t) => t.decision === "approve").length;
  const denials = (tally ?? []).filter((t) => t.decision === "deny").length;

  // 6. If amount under threshold, only the custodian's approval is needed —
  //    no quorum required. If amount >= threshold, full quorum.
  const requiresQuorum =
    BigInt(v.amount_lamports) >= BigInt(group.threshold_lamports);
  const quorum_met = requiresQuorum
    ? approvals >= group.quorum
    : approvals >= 1;

  // 7. If quorum just met, flip the request's status. The signer cron
  //    reads group_spend_requests where status='quorum_met' and fires
  //    spend_via_pact. No phase5_executions row is written here — the
  //    audit log is the signer's responsibility, not ours.
  let request_advanced = false;
  if (quorum_met && v.decision === "approve" && requestRow.status === "pending") {
    const { error: advErr } = await sb
      .from("group_spend_requests")
      .update({ status: "quorum_met" })
      .eq("request_id", v.request_id)
      .eq("status", "pending"); // conditional — race-safe
    if (!advErr) request_advanced = true;
  }

  return NextResponse.json({
    ok: true,
    approvals,
    denials,
    quorum_required: requiresQuorum ? group.quorum : 1,
    quorum_met,
    request_status: quorum_met
      ? "quorum_met"
      : (requestRow.status as "pending" | "quorum_met"),
    request_advanced,
    pact_pubkey: requestRow.pact_pubkey,
  });
}
