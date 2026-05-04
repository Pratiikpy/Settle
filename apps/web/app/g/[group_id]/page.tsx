"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { W6AppShell } from "../../../components/w6-app-shell";
import { lamportsToUsdc, timeAgo } from "../../../lib/format";

interface Member {
  member_pubkey: string;
  role: "voter" | "viewer";
}

interface Group {
  group_id: string;
  label: string;
  custodian_pubkey: string;
  quorum: number;
  threshold_lamports: string;
  holding_card: string;
}

interface SpendRequest {
  request_id: string;
  requester_pubkey: string;
  dest_pubkey: string;
  amount_lamports: string;
  status: "pending" | "quorum_met" | "fired" | "cancelled" | "expired";
  note: string | null;
  created_at: string;
  expires_at: string;
  approvals: number;
  denials: number;
}

const STATUS_LABEL: Record<SpendRequest["status"], string> = {
  pending: "Pending",
  quorum_met: "Quorum met",
  fired: "Executed",
  cancelled: "Cancelled",
  expired: "Expired",
};

const STATUS_COLOR: Record<SpendRequest["status"], string> = {
  pending: "var(--w6-warn-cluster)",
  quorum_met: "var(--w6-ok)",
  fired: "var(--w6-ink-4)",
  cancelled: "var(--w6-ink-5)",
  expired: "var(--w6-ink-5)",
};

export default function GroupIndexPage() {
  const { group_id } = useParams<{ group_id: string }>();
  const { publicKey } = useWallet();
  const me = publicKey?.toBase58() ?? "";

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<SpendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!group_id) return;
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const [groupRes, reqsRes] = await Promise.all([
          fetch(`/api/group-accounts?group_id=${group_id}`),
          fetch(`/api/group-accounts/${group_id}/requests`),
        ]);
        if (cancelled) return;
        if (!groupRes.ok) {
          setError("Group not found.");
          return;
        }
        const gj = (await groupRes.json()) as { group: Group; members: Member[] };
        const rj = reqsRes.ok
          ? ((await reqsRes.json()) as { requests: SpendRequest[] })
          : { requests: [] };
        if (!cancelled) {
          setGroup(gj.group);
          setMembers(gj.members ?? []);
          setRequests(rj.requests ?? []);
        }
      } catch {
        if (!cancelled) setError("Could not load group.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [group_id, me]);

  if (loading) {
    return (
      <W6AppShell>
        <div className="w6-card-flat" style={{ padding: 60, textAlign: "center" }}>
          <div className="w6-muted" style={{ fontSize: 13 }}>Loading…</div>
        </div>
      </W6AppShell>
    );
  }

  if (error || !group) {
    return (
      <W6AppShell>
        <div className="w6-card" style={{ padding: 32, textAlign: "center" }}>
          <p className="w6-muted" style={{ fontSize: 14 }}>{error ?? "Group not found."}</p>
          <Link href="/groups" className="w6-btn w6-btn-secondary w6-btn-sm" style={{ marginTop: 16, display: "inline-block" }}>
            ← Back to groups
          </Link>
        </div>
      </W6AppShell>
    );
  }

  const myRole = members.find((m) => m.member_pubkey === me)?.role ?? null;
  const pendingRequests = requests.filter((r) => r.status === "pending" || r.status === "quorum_met");
  const pastRequests = requests.filter((r) => r.status !== "pending" && r.status !== "quorum_met");

  return (
    <W6AppShell>
      <div style={{ maxWidth: 720 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            <Link href="/groups" style={{ color: "inherit" }}>Groups</Link>
            {" · "}
            {group.label}
          </div>
          <h1 className="w6-heading" style={{ fontSize: 32, margin: "8px 0 0", lineHeight: 1.1 }}>
            {group.label}
          </h1>
          <div className="w6-muted" style={{ fontSize: 13, marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>Quorum: {group.quorum} of {members.filter((m) => m.role === "voter").length} voters</span>
            <span>Threshold: ${lamportsToUsdc(group.threshold_lamports)} USDC</span>
            {myRole && <span style={{ color: "var(--w6-ok)" }}>You are a {myRole}</span>}
          </div>
        </div>

        {/* Pending requests */}
        <div className="w6-eyebrow" style={{ marginBottom: 12 }}>
          Active requests ({pendingRequests.length})
        </div>
        {pendingRequests.length === 0 ? (
          <div className="w6-card" style={{ padding: 28, textAlign: "center", marginBottom: 24 }}>
            <p className="w6-muted" style={{ fontSize: 13 }}>No pending requests.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {pendingRequests.map((r) => (
              <Link
                key={r.request_id}
                href={`/g/${group_id}/request/${r.request_id}`}
                className="w6-card"
                style={{ padding: 18, textDecoration: "none", display: "block" }}
              >
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <span className="w6-heading" style={{ fontSize: 15 }}>
                      ${lamportsToUsdc(r.amount_lamports)} USDC
                    </span>
                    {r.note && (
                      <span className="w6-muted" style={{ fontSize: 13, marginLeft: 10 }}>
                        {r.note}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: STATUS_COLOR[r.status],
                      whiteSpace: "nowrap",
                    }}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
                <div className="w6-muted" style={{ fontSize: 12, marginTop: 6, display: "flex", gap: 16 }}>
                  <span>To: {r.dest_pubkey.slice(0, 8)}…</span>
                  <span>✓ {r.approvals} · ✗ {r.denials}</span>
                  <span>Expires {timeAgo(r.expires_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Past requests */}
        {pastRequests.length > 0 && (
          <>
            <div className="w6-eyebrow" style={{ marginBottom: 12 }}>History</div>
            <div className="w6-card-flat" style={{ overflow: "hidden", marginBottom: 24 }}>
              <div style={{ overflowX: "auto" }}>
                <table className="w6-tbl">
                  <thead>
                    <tr>
                      <th>Amount</th>
                      <th>Note</th>
                      <th>Status</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastRequests.map((r) => (
                      <tr
                        key={r.request_id}
                        style={{ cursor: "pointer" }}
                        onClick={() => { window.location.href = `/g/${group_id}/request/${r.request_id}`; }}
                      >
                        <td className="w6-mono" style={{ fontSize: 13, fontWeight: 500 }}>
                          ${lamportsToUsdc(r.amount_lamports)}
                        </td>
                        <td className="w6-muted" style={{ fontSize: 12 }}>{r.note ?? "—"}</td>
                        <td style={{ fontSize: 12, color: STATUS_COLOR[r.status] }}>
                          {STATUS_LABEL[r.status]}
                        </td>
                        <td className="w6-muted" style={{ fontSize: 12 }}>{timeAgo(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <Link href="/groups" className="w6-btn w6-btn-secondary w6-btn-sm">
          ← All groups
        </Link>
      </div>

      <style>{`
        .w6-tbl { width: 100%; border-collapse: collapse; }
        .w6-tbl th {
          text-align: left; padding: 10px 16px; font-size: 11px;
          font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--w6-ink-4); border-bottom: 1px solid var(--w6-rule);
        }
        .w6-tbl td { padding: 12px 16px; border-bottom: 1px solid var(--w6-rule-2); }
        .w6-tbl tbody tr:last-child td { border-bottom: 0; }
        .w6-tbl tbody tr:hover td { background: var(--w6-bg-2); }
      `}</style>
    </W6AppShell>
  );
}
