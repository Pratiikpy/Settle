"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { toast } from "sonner";
import { formatUsdc } from "@settle/sdk";
import { W6AppShell } from "../../../../../components/w6-app-shell";
import { getSolscanUrl } from "../../../../../lib/solana";

/**
 * /g/[group_id]/request/[request_id] — shareable invitation page.
 *
 * Members get a link to this URL when a custodian creates a spend
 * request. The page:
 *   - Anyone can VIEW the request (read-only public-shape data).
 *   - If the connected wallet is a voter on this group, shows the
 *     vote buttons + auto-fills the request_id (no manual entry).
 *   - Non-members see a polite "you're not a voter on this group"
 *     message + link to the public group page.
 *
 * Why a /g/ short prefix instead of /groups/[id]/request/[id]: link
 * length matters when sharing in chat. /g/<8>/request/<8> is ~25
 * chars vs /groups/<36>/request/<36> at ~85.
 *
 * Why ?vote=auto auto-fill: members shouldn't have to copy a UUID
 * out of a Slack message to vote. The page handles the lookup +
 * attestation signing in one click.
 */

interface SpendRequest {
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

interface Group {
  group_id: string;
  label: string;
  custodian_pubkey: string;
  quorum: number;
  threshold_lamports: string;
  holding_card: string;
}

export default function GroupRequestSharePage() {
  const params = useParams<{ group_id: string; request_id: string }>();
  const { connected, publicKey, signMessage } = useWallet();
  const me = publicKey?.toBase58() ?? "";

  const [group, setGroup] = useState<Group | null>(null);
  const [request, setRequest] = useState<SpendRequest | null>(null);
  const [memberRole, setMemberRole] = useState<"voter" | "viewer" | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function reload() {
    if (!params.group_id || !params.request_id) return;
    setLoading(true);
    try {
      // 1. Group + members.
      const groupRes = await fetch(
        `/api/group-accounts?group_id=${params.group_id}`,
      );
      if (groupRes.ok) {
        const j = (await groupRes.json()) as {
          group: Group;
          members: Array<{ member_pubkey: string; role: "voter" | "viewer" }>;
        };
        setGroup(j.group);
        if (me) {
          const mem = j.members.find((m) => m.member_pubkey === me);
          setMemberRole(mem?.role ?? null);
        }
      }

      // 2. Specific request from the group's request list.
      const reqsRes = await fetch(
        `/api/group-accounts/${params.group_id}/requests`,
      );
      if (reqsRes.ok) {
        const j = (await reqsRes.json()) as { requests: SpendRequest[] };
        const r = j.requests.find((x) => x.request_id === params.request_id);
        setRequest(r ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.group_id, params.request_id, me]);

  async function vote(decision: "approve" | "deny") {
    if (!group || !request || !signMessage || !me) {
      return toast.error("Connect wallet first.");
    }
    setBusy(true);
    try {
      const msg = `settle:group-spend:${group.group_id}:${request.request_id}:${request.amount_lamports}:${request.dest_pubkey}:${decision}`;
      const sigBytes = await signMessage(new TextEncoder().encode(msg));
      const signature_b58 = bs58.encode(sigBytes);
      const res = await fetch("/api/group-accounts/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: group.group_id,
          request_id: request.request_id,
          member_pubkey: me,
          amount_lamports: request.amount_lamports,
          dest_pubkey: request.dest_pubkey,
          decision,
          signature_b58,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "vote_failed");
      }
      const j = (await res.json()) as {
        approvals: number;
        quorum_required: number;
        quorum_met: boolean;
      };
      toast.success(
        j.quorum_met
          ? `Vote recorded · quorum reached (${j.approvals}/${j.quorum_required}). Signer cron fires next tick.`
          : `Vote recorded (${j.approvals}/${j.quorum_required} approvals).`,
      );
      void ed25519.verify; // silence unused warning if linter complains
      await reload();
    } catch (e) {
      toast.error(`Vote failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function copyShareLink() {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/g/${params.group_id}/request/${params.request_id}`;
    void navigator.clipboard.writeText(url).then(() => toast.success("Link copied"));
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-12 text-sm text-[#52525b]">
        Loading…
      </main>
    );
  }

  if (!group || !request) {
    return (
    <W6AppShell forceSurface="consumer">
      <div style={{ maxWidth: 880 }}>
          <h1 className="text-2xl font-medium">Request not found</h1>
          <p className="mt-2 text-sm text-[#52525b]">
            The request may have been cancelled or the link is wrong.
          </p>
          <Link
            href="/groups"
            className="mt-4 inline-block text-accent hover:underline"
          >
            Back to /groups →
          </Link>
        </div>
    </W6AppShell>
    );
  }

  const myVote = request.voters.find((v) => v.member_pubkey === me);
  const isFired = request.status === "fired";
  const isPending = request.status === "pending";
  const isQuorumMet = request.status === "quorum_met";

  return (
    <W6AppShell forceSurface="consumer">
      <div style={{ maxWidth: 720 }}>
        <header style={{ marginBottom: 24 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Group spend request · {group.label}
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            {formatUsdc(request.amount_lamports)} →{" "}
            <code
              className="w6-mono"
              style={{ color: "var(--w6-ink-2)", fontSize: "0.7em" }}
            >
              {request.dest_pubkey.slice(0, 6)}…{request.dest_pubkey.slice(-4)}
            </code>
          </h1>
          {request.note && (
            <p className="mt-2 text-sm text-[#52525b]">{request.note}</p>
          )}
          <p className="mt-3 text-[11px] text-[#52525b]">
            Requested {new Date(request.created_at).toLocaleString()} by{" "}
            <code className="font-mono">
              {request.requester_pubkey.slice(0, 6)}…
            </code>
          </p>
        </header>

        {/* Status + vote tally */}
        <section
          className={`mb-6 rounded-2xl border p-5 ${
            isFired
              ? "border-emerald-400/30 bg-emerald-400/[0.04]"
              : isQuorumMet
                ? "border-amber-400/30 bg-amber-400/[0.04]"
                : "border-[#e4e4e7] bg-[#fafafa]"
          }`}
        >
          <div className="flex items-baseline justify-between">
            <strong className="text-sm">
              Status:{" "}
              <span className="uppercase tracking-wide">{request.status}</span>
            </strong>
            <span className="text-[11px] text-[#52525b]">
              {request.approvals} approvals · {request.denials} denials · need{" "}
              {group.quorum}
            </span>
          </div>
          {isFired && request.signature && (
            <a
              href={getSolscanUrl(request.signature)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-[11px] text-emerald-300 hover:underline"
            >
              On-chain ↗
            </a>
          )}
        </section>

        {/* Voting controls */}
        {!connected ? (
          <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5 text-sm text-[#52525b]">
            Connect your wallet to see voting controls. If you&apos;re a member
            of {group.label}, you&apos;ll be able to approve/deny here.
          </div>
        ) : memberRole !== "voter" ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-4 text-xs text-amber-200">
            You&apos;re connected as{" "}
            <code className="font-mono">
              {me.slice(0, 6)}…{me.slice(-4)}
            </code>
            , but you&apos;re {memberRole === "viewer" ? "a viewer" : "not a member"}{" "}
            of this group. Only voters can sign attestations.
          </div>
        ) : myVote ? (
          <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5 text-sm">
            You voted{" "}
            <strong
              className={
                myVote.decision === "approve"
                  ? "text-emerald-300"
                  : "text-[#27272a]"
              }
            >
              {myVote.decision}
            </strong>
            .
          </div>
        ) : isPending ? (
          <section className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
            <p className="text-[11px] text-[#52525b]">
              Your vote signs a canonical attestation:
            </p>
            <code className="mt-2 block break-all rounded bg-[#fafafa] p-2 font-mono text-[10px] text-[#52525b]">
              settle:group-spend:{group.group_id}:{request.request_id}:
              {request.amount_lamports}:{request.dest_pubkey}:&lt;decision&gt;
            </code>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => vote("approve")}
                disabled={busy}
                className="rounded-full bg-emerald-500/15 border border-emerald-400/40 px-4 py-2 text-xs text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {busy ? "Signing…" : "Approve"}
              </button>
              <button
                onClick={() => vote("deny")}
                disabled={busy}
                className="rounded-full border border-[#a1a1aa] px-4 py-2 text-xs hover:bg-[#f4f4f5] disabled:opacity-50"
              >
                Deny
              </button>
            </div>
          </section>
        ) : (
          <p className="text-sm text-[#52525b]">
            This request is no longer open for voting.
          </p>
        )}

        {/* Share + back-links */}
        <div className="mt-8 flex flex-wrap gap-2 text-[11px]">
          <button
            onClick={copyShareLink}
            className="rounded-full border border-[#e4e4e7] px-3 py-1.5 text-[#52525b] hover:bg-[#f4f4f5]"
          >
            Copy share link
          </button>
          <Link
            href="/groups"
            className="rounded-full border border-[#e4e4e7] px-3 py-1.5 text-[#52525b] hover:bg-[#f4f4f5]"
          >
            All groups →
          </Link>
        </div>
      </div>
    </W6AppShell>
  );
}
