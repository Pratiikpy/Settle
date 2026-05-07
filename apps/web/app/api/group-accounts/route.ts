import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireOwnerAuth } from "../../../lib/require-owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F7.8 — Group accounts CRUD + member listing.
 *
 *   GET    /api/group-accounts?member=<pubkey>   — every group I'm in
 *   GET    /api/group-accounts?group_id=<uuid>    — one group + its members
 *   POST   /api/group-accounts                     — create
 *   POST   /api/group-accounts/members             — add a member (custodian only)
 *
 * The /spend endpoint that takes group approvals lives at
 * /api/group-accounts/approve and is intentionally a separate route to
 * keep the auth check tight (only the custodian can fire after quorum).
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const CreateBody = z.object({
  custodian_pubkey: z.string().regex(PUBKEY_RE),
  holding_card: z.string().regex(PUBKEY_RE),
  label: z.string().min(1).max(80),
  quorum: z.number().int().min(1).max(20),
  threshold_lamports: z.string().regex(/^\d+$/).optional(),
  members: z
    .array(z.object({ pubkey: z.string().regex(PUBKEY_RE), role: z.enum(["voter", "viewer"]) }))
    .min(1)
    .max(20),
});

function getSb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const member = url.searchParams.get("member");
  const groupId = url.searchParams.get("group_id");
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  if (groupId) {
    const { data: group } = await sb
      .from("group_accounts")
      .select(
        "group_id, label, holding_card, custodian_pubkey, quorum, threshold_lamports, created_at",
      )
      .eq("group_id", groupId)
      .maybeSingle();
    if (!group) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const { data: members } = await sb
      .from("group_account_members")
      .select("member_pubkey, role, joined_at")
      .eq("group_id", groupId);
    return NextResponse.json({ ok: true, group, members: members ?? [] });
  }

  if (member) {
    if (!PUBKEY_RE.test(member))
      return NextResponse.json({ error: "invalid_member" }, { status: 400 });
    const { data: rows } = await sb
      .from("group_account_members")
      .select("group_id, role, joined_at")
      .eq("member_pubkey", member);
    if (!rows || rows.length === 0) return NextResponse.json({ ok: true, groups: [] });
    const ids = rows.map((r) => r.group_id);
    const { data: groups } = await sb
      .from("group_accounts")
      .select(
        "group_id, label, holding_card, custodian_pubkey, quorum, threshold_lamports, created_at",
      )
      .in("group_id", ids);
    return NextResponse.json({ ok: true, groups: groups ?? [], membership: rows });
  }

  return NextResponse.json({ error: "member_or_group_id_required" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const v = parsed.data;
  // Bug #61 — caller must sign as the custodian they claim to be.
  // Without this, anyone can pollute a victim's group list and add
  // themselves as a voter, enabling downstream attacks via the
  // group-accounts/* surface.
  const authFail = await requireOwnerAuth(req, v.custodian_pubkey);
  if (authFail) return authFail;

  const voters = v.members.filter((m) => m.role === "voter").length;
  if (v.quorum > voters) {
    return NextResponse.json(
      { error: "quorum_exceeds_voters", voters, quorum: v.quorum },
      { status: 400 },
    );
  }
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const { data: group, error: groupErr } = await sb
    .from("group_accounts")
    .insert({
      custodian_pubkey: v.custodian_pubkey,
      holding_card: v.holding_card,
      label: v.label,
      quorum: v.quorum,
      threshold_lamports: v.threshold_lamports ?? "100000000",
    })
    .select()
    .single();
  if (groupErr || !group)
    return NextResponse.json({ error: groupErr?.message ?? "create_failed" }, { status: 500 });

  // Insert members. Custodian gets auto-added as a voter if they aren't
  // already in the list — they almost always need to be one.
  const memberRows = v.members.map((m) => ({
    group_id: group.group_id,
    member_pubkey: m.pubkey,
    role: m.role,
  }));
  const hasCustodian = memberRows.some((m) => m.member_pubkey === v.custodian_pubkey);
  if (!hasCustodian) {
    memberRows.push({
      group_id: group.group_id,
      member_pubkey: v.custodian_pubkey,
      role: "voter",
    });
  }
  const { error: memErr } = await sb.from("group_account_members").insert(memberRows);
  if (memErr) {
    // Roll back the group creation since members failed.
    await sb.from("group_accounts").delete().eq("group_id", group.group_id);
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, group, members: memberRows });
}
