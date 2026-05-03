"use client";

/**
 * Wave 6 — Consumer · Groups.
 *
 * Layout matches `setltlt protype/settle/screen-c-other.jsx`
 * `ScreenConsumerGroups` 1:1:
 *   - PageHeader (Groups / "Spend together. Vote first." / subtitle /
 *     "+ New group" CTA)
 *   - grid-3 of selectable group cards (kicker · heading · meta · pending pill)
 *   - card-flat for the active group's pending votes
 *   - Per-request row: avatar, requester → dest, vote ratio, Approve/Deny
 *
 * Real backend: `/api/group-accounts?member=<pubkey>` lists groups,
 * `/api/group-accounts/:gid/requests` lists requests, `/api/group-
 * accounts/approve` records signed attestations. Wallet-sig auth is
 * preserved end-to-end (no canonical message changes).
 */

import { useEffect, useMemo, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { toast } from "sonner";
import { formatUsdc } from "@settle/sdk";
import { W6AppShell } from "../../components/w6-app-shell";
import { getSolscanUrl } from "../../lib/solana";

interface Group {
  group_id: string;
  label: string;
  holding_card: string;
  custodian_pubkey: string;
  quorum: number;
  threshold_lamports: string;
  created_at: string;
}

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

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function avatarInitial(s: string): string {
  return (s.replace(/[^A-Za-z0-9]/g, "")[0] ?? "?").toUpperCase();
}

export default function GroupsPage() {
  const { connected, publicKey, signMessage, signTransaction } = useWallet();
  const { connection } = useConnection();
  const me = publicKey?.toBase58() ?? "";

  const [groups, setGroups] = useState<Group[]>([]);
  const [requestsByGroup, setRequestsByGroup] = useState<
    Record<string, SpendRequest[]>
  >({});
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [draftDest, setDraftDest] = useState("");
  const [draftAmount, setDraftAmount] = useState("");
  const [draftNote, setDraftNote] = useState("");

  async function reload() {
    if (!me || !PUBKEY_RE.test(me)) return;
    const r = await fetch(`/api/group-accounts?member=${me}`);
    if (!r.ok) return;
    const j = (await r.json()) as { groups?: Group[] };
    const gs = j.groups ?? [];
    setGroups(gs);
    if (gs.length > 0 && !active) setActive(gs[0]!.group_id);
    const byGroup: Record<string, SpendRequest[]> = {};
    await Promise.all(
      gs.map(async (g) => {
        const rr = await fetch(`/api/group-accounts/${g.group_id}/requests`);
        if (!rr.ok) return;
        const jj = (await rr.json()) as { requests?: SpendRequest[] };
        byGroup[g.group_id] = jj.requests ?? [];
      }),
    );
    setRequestsByGroup(byGroup);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const activeGroup = useMemo(
    () => groups.find((g) => g.group_id === active) ?? null,
    [groups, active],
  );
  const activeReqs = active ? requestsByGroup[active] ?? [] : [];
  const isCustodian = activeGroup?.custodian_pubkey === me;

  async function vote(
    g: Group,
    r: SpendRequest,
    decision: "approve" | "deny",
  ) {
    if (!signMessage || !me) return toast.error("Connect wallet first.");
    setBusy({ ...busy, [`vote-${r.request_id}-${decision}`]: true });
    try {
      const msg = `settle:group-spend:${g.group_id}:${r.request_id}:${r.amount_lamports}:${r.dest_pubkey}:${decision}`;
      const sigBytes = await signMessage(new TextEncoder().encode(msg));
      const signature_b58 = bs58.encode(sigBytes);
      const res = await fetch("/api/group-accounts/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: g.group_id,
          request_id: r.request_id,
          member_pubkey: me,
          amount_lamports: r.amount_lamports,
          dest_pubkey: r.dest_pubkey,
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
          ? `Vote recorded · quorum reached (${j.approvals}/${j.quorum_required}). Cron fires next tick.`
          : `Vote recorded (${j.approvals}/${j.quorum_required} approvals).`,
      );
      await reload();
    } catch (e) {
      toast.error(`Vote failed: ${(e as Error).message}`);
    } finally {
      setBusy({ ...busy, [`vote-${r.request_id}-${decision}`]: false });
    }
  }

  async function requestSpend(g: Group) {
    if (!me || !signTransaction) return toast.error("Connect wallet first.");
    if (!draftDest.trim() || !draftAmount.trim()) {
      return toast.error("Recipient + amount required.");
    }
    setBusy({ ...busy, [`request-${g.group_id}`]: true });
    try {
      const buildRes = await fetch("/api/group-accounts/request-spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: g.group_id,
          requester_pubkey: me,
          dest_pubkey: draftDest.trim(),
          amount_usdc: draftAmount.trim(),
          note: draftNote || undefined,
        }),
      });
      if (!buildRes.ok) {
        const err = await buildRes.json();
        throw new Error(err.error ?? `request_failed_${buildRes.status}`);
      }
      const built = (await buildRes.json()) as {
        transaction: string;
        request_id: string;
        pact_pubkey: string;
        cap_usdc: string;
        quorum_required: number;
      };
      toast.message(
        `Request created. Sign to spawn the $${built.cap_usdc} Pact, then collect ${built.quorum_required} approvals.`,
      );
      const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: tx.recentBlockhash!,
          lastValidBlockHeight: tx.lastValidBlockHeight!,
        },
        "confirmed",
      );
      toast.success(
        `Pact spawned. Members can now vote. Need ${built.quorum_required} approvals.`,
      );
      setDraftDest("");
      setDraftAmount("");
      setDraftNote("");
      setShowNewRequest(false);
      await reload();
    } catch (e) {
      toast.error(`Request failed: ${(e as Error).message}`);
    } finally {
      setBusy({ ...busy, [`request-${g.group_id}`]: false });
    }
  }

  return (
    <W6AppShell>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 24,
          marginBottom: 28,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 280 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Groups
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            Spend together. Vote first.
          </h1>
          <p
            className="w6-muted"
            style={{
              fontSize: 14,
              marginTop: 8,
              maxWidth: 640,
              lineHeight: 1.5,
            }}
          >
            Quorum + threshold accounts for families, teams, and DAOs.
            Members request a spend; quorum signs; the cron fires.
          </p>
        </div>
        <button
          type="button"
          className="w6-btn w6-btn-primary w6-btn-sm"
          onClick={() => toast.info("New-group flow coming soon.")}
        >
          + New group
        </button>
      </div>

      {!connected ? (
        <div className="w6-card" style={{ padding: 32, textAlign: "center" }}>
          <p className="w6-muted" style={{ fontSize: 14 }}>
            Connect a wallet to see your groups.
          </p>
        </div>
      ) : groups.length === 0 ? (
        <div className="w6-card" style={{ padding: 40, textAlign: "center" }}>
          <div className="w6-heading" style={{ fontSize: 20, marginBottom: 8 }}>
            You&rsquo;re not in any groups yet
          </div>
          <p
            className="w6-muted"
            style={{
              fontSize: 13,
              marginBottom: 16,
              maxWidth: 480,
              margin: "0 auto 16px",
            }}
          >
            Groups are quorum-controlled vaults. Anyone can pre-commit to
            spending via a Pact, but only when {`{quorum}`} of {`{members}`}{" "}
            sign off does the cron release the funds.
          </p>
        </div>
      ) : (
        <>
          {/* Group selector grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 16,
              marginBottom: 28,
            }}
            className="w6-groups-grid"
          >
            {groups.map((g) => {
              const reqs = requestsByGroup[g.group_id] ?? [];
              const pending = reqs.filter(
                (r) => r.status === "pending" || r.status === "quorum_met",
              ).length;
              const isSel = active === g.group_id;
              const isCustodianHere = g.custodian_pubkey === me;
              return (
                <button
                  key={g.group_id}
                  type="button"
                  onClick={() => setActive(g.group_id)}
                  className="w6-card w6-card-hover"
                  style={{
                    padding: 20,
                    textAlign: "left",
                    borderColor: isSel ? "var(--w6-ink)" : "var(--w6-rule)",
                    cursor: "pointer",
                    background: "var(--w6-bg)",
                  }}
                >
                  <div className="w6-eyebrow" style={{ marginBottom: 8 }}>
                    {isCustodianHere ? "Custodian" : "Member"}
                  </div>
                  <div
                    className="w6-heading"
                    style={{ fontSize: 18, marginBottom: 4 }}
                  >
                    {g.label}
                  </div>
                  <div
                    className="w6-muted"
                    style={{ fontSize: 12.5, marginBottom: 12 }}
                  >
                    quorum {g.quorum} · threshold $
                    {formatUsdc(g.threshold_lamports)}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        className="w6-mono"
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--w6-ink-2)",
                        }}
                      >
                        {g.holding_card.slice(0, 6)}…{g.holding_card.slice(-4)}
                      </div>
                      <div className="w6-micro">holding card</div>
                    </div>
                    {pending > 0 && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 9px",
                          borderRadius: 999,
                          background: "rgba(22, 163, 74, 0.08)",
                          color: "var(--w6-ok)",
                          fontSize: 11.5,
                          fontWeight: 500,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "var(--w6-ok)",
                          }}
                        />
                        {pending} pending
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active group requests */}
          {activeGroup && (
            <div className="w6-card-flat" style={{ overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "18px 24px",
                  borderBottom: "1px solid var(--w6-rule)",
                  gap: 12,
                }}
              >
                <span className="w6-eyebrow" style={{ flex: 1 }}>
                  {activeGroup.label} · pending votes
                </span>
                {isCustodian && (
                  <button
                    type="button"
                    className="w6-btn w6-btn-secondary w6-btn-sm"
                    onClick={() => setShowNewRequest((v) => !v)}
                  >
                    {showNewRequest ? "Cancel" : "+ Request spend"}
                  </button>
                )}
              </div>

              {/* Custodian-only inline request form */}
              {isCustodian && showNewRequest && (
                <div
                  style={{
                    padding: "16px 24px",
                    borderBottom: "1px solid var(--w6-rule)",
                    background: "var(--w6-bg-2)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                      marginBottom: 10,
                    }}
                  >
                    <input
                      placeholder="Recipient pubkey"
                      value={draftDest}
                      onChange={(e) => setDraftDest(e.target.value)}
                      className="w6-input"
                    />
                    <input
                      placeholder="Amount USDC"
                      value={draftAmount}
                      onChange={(e) => setDraftAmount(e.target.value)}
                      inputMode="decimal"
                      className="w6-input"
                    />
                  </div>
                  <input
                    placeholder="Note (optional)"
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    className="w6-input"
                    style={{ width: "100%", marginBottom: 10 }}
                  />
                  <button
                    type="button"
                    onClick={() => requestSpend(activeGroup)}
                    disabled={busy[`request-${activeGroup.group_id}`]}
                    className="w6-btn w6-btn-primary w6-btn-sm"
                  >
                    {busy[`request-${activeGroup.group_id}`]
                      ? "Opening spending rule…"
                      : "Create request + spending rule"}
                  </button>
                </div>
              )}

              {/* Request rows */}
              {activeReqs.length === 0 ? (
                <div
                  style={{ padding: 48, textAlign: "center" }}
                  className="w6-muted"
                >
                  No pending requests.
                </div>
              ) : (
                activeReqs.map((r) => {
                  const myVote = r.voters.find((v) => v.member_pubkey === me);
                  const isPending = r.status === "pending";
                  const isFired = r.status === "fired";
                  return (
                    <div
                      key={r.request_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "18px 24px",
                        borderBottom: "1px solid var(--w6-rule-2)",
                        gap: 16,
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: "var(--w6-ink)",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {avatarInitial(r.requester_pubkey)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                          {r.requester_pubkey.slice(0, 4)}…
                          {r.requester_pubkey.slice(-4)} requests{" "}
                          <strong>${formatUsdc(r.amount_lamports)}</strong> →{" "}
                          {r.dest_pubkey.slice(0, 4)}…{r.dest_pubkey.slice(-4)}
                        </div>
                        {r.note && (
                          <div
                            className="w6-muted"
                            style={{ fontSize: 12, marginTop: 2 }}
                          >
                            {r.note}
                          </div>
                        )}
                      </div>
                      <div
                        className="w6-mono"
                        style={{ fontSize: 12, color: "var(--w6-ink-3)" }}
                      >
                        {r.approvals}/{activeGroup.quorum} approvals
                      </div>
                      {isFired ? (
                        r.signature ? (
                          <a
                            href={getSolscanUrl(r.signature)}
                            target="_blank"
                            rel="noreferrer"
                            className="w6-btn w6-btn-secondary w6-btn-sm"
                          >
                            On-chain ↗
                          </a>
                        ) : (
                          <span
                            className="w6-muted"
                            style={{ fontSize: 12 }}
                          >
                            fired
                          </span>
                        )
                      ) : myVote ? (
                        <span
                          className="w6-mono"
                          style={{
                            fontSize: 12,
                            color:
                              myVote.decision === "approve"
                                ? "var(--w6-ok)"
                                : "var(--w6-ink-4)",
                          }}
                        >
                          you · {myVote.decision}
                        </span>
                      ) : isPending ? (
                        <>
                          <button
                            type="button"
                            onClick={() => vote(activeGroup, r, "deny")}
                            disabled={busy[`vote-${r.request_id}-deny`]}
                            className="w6-btn w6-btn-secondary w6-btn-sm"
                          >
                            Pass
                          </button>
                          <button
                            type="button"
                            onClick={() => vote(activeGroup, r, "approve")}
                            disabled={busy[`vote-${r.request_id}-approve`]}
                            className="w6-btn w6-btn-primary w6-btn-sm"
                          >
                            ✓ Approve
                          </button>
                        </>
                      ) : (
                        <span
                          className="w6-muted"
                          style={{ fontSize: 12 }}
                        >
                          {r.status}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}

      <style>{`
        @media (max-width: 880px) {
          .w6-groups-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 560px) {
          .w6-groups-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </W6AppShell>
  );
}
