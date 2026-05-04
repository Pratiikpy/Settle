"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { toast } from "sonner";
import { W6AppShell } from "../../../../components/w6-app-shell";
import { buildRevokeCrosschainCardIxData } from "../../../../lib/ika/build-ix";
import { SETTLE_DWALLET_ROUTER_PROGRAM_ID } from "../../../../lib/ika/program-ids";

const ROUTER = new PublicKey(SETTLE_DWALLET_ROUTER_PROGRAM_ID);

interface CrosschainCardSnapshot {
  card_pubkey: string;
  authority_pubkey: string;
  agent_pubkey: string;
  label: string | null;
  dwallet_pubkey: string;
  target_chain: string;
  daily_cap_minor: string;
  per_call_max_minor: string;
  used_today_minor: string;
  expiry_slot: string | null;
  revoked: boolean;
  policy_version: number;
  created_at: string;
  allowlist: Array<{
    chain_namespace: string;
    chain_reference: string;
    recipient: string;
    asset: string;
    capability_hash: string | null;
  }>;
}

export default function CrosschainCardDetailPage() {
  const params = useParams<{ card_pubkey: string }>();
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [card, setCard] = useState<CrosschainCardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!params.card_pubkey) return;
    setLoading(true);
    fetch(`/api/crosschain/cards/${encodeURIComponent(params.card_pubkey)}`)
      .then(async (r) => {
        if (r.status === 404) {
          setError("Card not found in indexer yet. It may be propagating — refresh in ~30s.");
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ ok: true; card: CrosschainCardSnapshot }>;
      })
      .then((j) => {
        if (j) setCard(j.card);
      })
      .catch(() => setError("Couldn't reach the indexer."))
      .finally(() => setLoading(false));
  }, [params.card_pubkey]);

  async function onRevoke() {
    if (!connected || !publicKey || !signTransaction || !card) return;
    if (publicKey.toBase58() !== card.authority_pubkey) {
      toast.error("Only the card's authority can revoke it.");
      return;
    }
    if (!confirm("Revoke this card? Future sign requests will fail. This cannot be undone.")) {
      return;
    }
    setBusy(true);
    try {
      const cardPda = new PublicKey(card.card_pubkey);
      const ix = new TransactionInstruction({
        programId: ROUTER,
        keys: [
          { pubkey: cardPda, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: false },
        ],
        data: buildRevokeCrosschainCardIxData(),
      });
      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      await connection.confirmTransaction(sig, "confirmed");
      toast.success("Card revoked");
      setCard({ ...card, revoked: true, policy_version: card.policy_version + 1 });
    } catch (err) {
      console.warn("[cards/crosschain] revoke failed:", err);
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <W6AppShell>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: 24 }} data-testid="crosschain-card-detail">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Link href="/dashboard" style={{ fontSize: 13, opacity: 0.7 }}>← dashboard</Link>
          <span data-testid="ika-badge" style={ikaBadge}>IKA</span>
        </div>

        {loading ? (
          <p style={{ marginTop: 32, opacity: 0.6 }}>Loading…</p>
        ) : error ? (
          <p data-testid="cc-error" style={{ marginTop: 32, color: "rgb(220,80,80)" }}>{error}</p>
        ) : !card ? (
          <p style={{ marginTop: 32, opacity: 0.6 }}>Card not found.</p>
        ) : (
          <>
            <h1 style={{ fontSize: 30, fontWeight: 700, marginTop: 12, letterSpacing: "-0.02em" }}>
              {card.label ?? "Cross-chain card"}
            </h1>

            <div data-testid="cc-status-row" style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
              <StatusPill revoked={card.revoked} />
              <span style={{ fontSize: 13, opacity: 0.7 }}>· policy v{card.policy_version}</span>
              <span style={{ fontSize: 13, opacity: 0.7 }}>· {card.target_chain}</span>
            </div>

            <div style={{ marginTop: 28, display: "grid", gap: 14 }}>
              <Detail label="Card PDA" value={card.card_pubkey} mono />
              <Detail label="Authority" value={card.authority_pubkey} mono />
              <Detail label="dWallet" value={card.dwallet_pubkey} mono />
              <Detail
                label="Per-call cap"
                value={`${weiToEth(card.per_call_max_minor)} ETH`}
                testId="cc-per-call-cap"
              />
              <Detail
                label="Daily cap"
                value={`${weiToEth(card.daily_cap_minor)} ETH`}
                testId="cc-daily-cap"
              />
              <Detail
                label="Used today"
                value={`${weiToEth(card.used_today_minor)} ETH`}
                testId="cc-used-today"
              />
              <Detail label="Expiry slot" value={card.expiry_slot ?? "never"} mono />
            </div>

            <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 28 }}>Allowlist ({card.allowlist.length})</h2>
            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              {card.allowlist.map((entry, i) => (
                <div
                  key={i}
                  data-testid={`cc-allowlist-entry-${i}`}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.08)",
                    fontSize: 13,
                    fontFamily: "ui-monospace, monospace",
                    background: "rgba(0,0,0,0.02)",
                  }}
                >
                  <div>{entry.chain_namespace}:{entry.chain_reference}</div>
                  <div style={{ opacity: 0.7 }}>recipient: {entry.recipient}</div>
                  <div style={{ opacity: 0.5, fontSize: 11 }}>
                    asset: {entry.asset} · capability: {entry.capability_hash ?? "any"}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 28, display: "flex", gap: 12 }}>
              <button
                data-testid="cc-revoke"
                onClick={onRevoke}
                disabled={card.revoked || busy || !connected}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  border: "1px solid rgba(220,80,80,0.3)",
                  background: card.revoked ? "rgba(0,0,0,0.05)" : "rgba(220,80,80,0.05)",
                  color: card.revoked ? "rgba(0,0,0,0.4)" : "rgb(180,40,40)",
                  cursor: card.revoked || busy ? "not-allowed" : "pointer",
                }}
              >
                {card.revoked ? "Already revoked" : busy ? "Revoking…" : "Revoke card"}
              </button>
            </div>

            <footer
              style={{
                marginTop: 36,
                paddingTop: 18,
                borderTop: "1px solid rgba(0,0,0,0.08)",
                fontSize: 11,
                opacity: 0.6,
                lineHeight: 1.5,
              }}
            >
              Your assets stay on their native chain. Settle never custodies them. Settle's program approves the
              signature only when policy passes; Ika produces the signature.
            </footer>
          </>
        )}
      </div>
    </W6AppShell>
  );
}

const ikaBadge: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  padding: "4px 8px",
  borderRadius: 6,
  background: "rgba(99,102,241,0.12)",
  color: "rgb(99,102,241)",
  border: "1px solid rgba(99,102,241,0.3)",
};

function StatusPill({ revoked }: { revoked: boolean }) {
  return (
    <span
      data-testid="cc-status-pill"
      style={{
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.05em",
        background: revoked ? "rgba(220,80,80,0.1)" : "rgba(34,197,94,0.1)",
        color: revoked ? "rgb(180,40,40)" : "rgb(34,140,80)",
        border: revoked ? "1px solid rgba(220,80,80,0.3)" : "1px solid rgba(34,197,94,0.3)",
      }}
    >
      {revoked ? "REVOKED" : "ACTIVE"}
    </span>
  );
}

function Detail({
  label,
  value,
  mono,
  testId,
}: {
  label: string;
  value: string;
  mono?: boolean;
  testId?: string;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 12, alignItems: "baseline" }}>
      <span style={{ fontSize: 12, opacity: 0.6, fontWeight: 600 }}>{label}</span>
      <span
        data-testid={testId}
        style={{
          fontFamily: mono ? "ui-monospace, monospace" : "inherit",
          fontSize: mono ? 12 : 14,
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function weiToEth(wei: string): string {
  // Convert chain-native minor units (18 decimals for ETH) to a human ETH string.
  const n = BigInt(wei);
  const whole = n / 10n ** 18n;
  const frac = n % 10n ** 18n;
  // Trim trailing zeros from the fractional portion.
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return fracStr.length === 0 ? whole.toString() : `${whole}.${fracStr}`;
}
