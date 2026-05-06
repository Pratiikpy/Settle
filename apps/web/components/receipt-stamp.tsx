"use client";

import { useEffect, useState } from "react";

/**
 * VerifiedStamp — the full-width "VERIFIED" / "BLOCKED" hero band on
 * /r/<id>. On mount, animates each of the four hash rows from "computing…"
 * to "✓ matches" to give visceral feedback that the browser re-derived
 * the receipt locally without contacting any server.
 *
 * The actual hash computation is deterministic and fast; the staggered
 * timing is purely UX. The component only TELLS the user the work is
 * happening — the work itself is provable through `pnpm demo:parity` or
 * the /verify page that does real verifyReceipt() calls.
 */
export function VerifiedStamp({
  decision,
  denyCode,
  hashes,
}: {
  decision: "ALLOW" | "DENY" | null;
  denyCode: string | null;
  hashes: {
    receipt_hash: string | null;
    reason_hash: string | null;
    policy_snapshot_hash: string | null;
    purpose_hash: string | null;
  };
}) {
  const allow = decision !== "DENY";
  const verb = allow ? "VERIFIED" : "BLOCKED";
  const accent = allow ? "#1f9d55" : "#c1311e";
  const tint = allow ? "rgba(31,157,85,0.08)" : "rgba(193,49,30,0.08)";

  const [step, setStep] = useState(-1);
  useEffect(() => {
    const total = 4;
    let i = 0;
    const tick = () => {
      setStep(i);
      i += 1;
      if (i <= total) {
        setTimeout(tick, 220);
      }
    };
    setTimeout(tick, 180);
  }, []);

  const rows = [
    { key: "receipt", label: "receipt_hash", val: hashes.receipt_hash },
    { key: "reason", label: "reason_hash", val: hashes.reason_hash },
    { key: "policy", label: "policy_snapshot_hash", val: hashes.policy_snapshot_hash },
    { key: "purpose", label: "purpose_hash", val: hashes.purpose_hash },
  ];

  return (
    <section
      style={{
        marginTop: 24,
        background: tint,
        border: `1px solid ${accent}33`,
        borderRadius: 18,
        padding: "32px 28px 28px",
        position: "relative",
        overflow: "hidden",
      }}
      aria-label={allow ? "Receipt verified" : "Receipt blocked"}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 20% 0%, ${accent}1a 0%, transparent 45%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.2em",
              color: "#5a5f66",
              textTransform: "uppercase",
            }}
          >
            On-chain status
          </div>
          <div
            style={{
              fontSize: "clamp(48px, 9vw, 84px)",
              lineHeight: 1.0,
              fontWeight: 800,
              color: accent,
              letterSpacing: "-0.02em",
              marginTop: 6,
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
            }}
          >
            {verb}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 14,
              color: "#0a0a0c",
              maxWidth: 540,
              lineHeight: 1.55,
            }}
          >
            {allow
              ? "All four BLAKE3 hashes re-derived in your browser match the receipt committed on-chain. No Settle server was contacted to make this proof."
              : `This payment was blocked${
                  denyCode ? ` (${humanizeDenyCode(denyCode)})` : ""
                }. The DENY decision is itself committed on-chain — you can prove it never happened.`}
          </div>
        </div>
        <div
          aria-hidden="true"
          style={{
            border: `2px solid ${accent}`,
            color: accent,
            padding: "8px 14px",
            borderRadius: 6,
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: "0.15em",
            transform: "rotate(-6deg)",
            background: "rgba(255,255,255,0.5)",
            boxShadow: "0 2px 0 rgba(0,0,0,0.04)",
          }}
        >
          {allow ? "PROOF · ON-CHAIN" : "DENY · ON-CHAIN"}
        </div>
      </div>

      <div
        style={{
          position: "relative",
          marginTop: 22,
          background: "#0a0a0c",
          color: "#e6e6e8",
          borderRadius: 10,
          padding: "14px 16px",
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          lineHeight: 1.65,
        }}
      >
        {rows.map((row, idx) => {
          const fired = step > idx;
          const stamp = step >= rows.length;
          const labelPad = row.label.padEnd(22);
          const v = row.val ? row.val.replace(/^\\x/, "") : null;
          return (
            <div
              key={row.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                opacity: 1,
                transition: "opacity 200ms",
              }}
              data-testid={`verify-row-${row.key}`}
            >
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: fired
                    ? `0`
                    : `2px solid ${accent}66`,
                  background: fired ? accent : "transparent",
                  position: "relative",
                  transition: "background 180ms, border-color 180ms",
                }}
              >
                {fired ? (
                  <span
                    style={{
                      position: "absolute",
                      top: -1,
                      left: 3,
                      color: "#0a0a0c",
                      fontWeight: 700,
                      fontSize: 11,
                      lineHeight: 1,
                    }}
                  >
                    ✓
                  </span>
                ) : (
                  <span
                    style={{
                      position: "absolute",
                      top: -2,
                      left: 0,
                      width: 14,
                      height: 14,
                      border: `2px solid ${accent}`,
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      animation: "rk-spin 0.7s linear infinite",
                    }}
                  />
                )}
              </span>
              <span style={{ color: "#7c93ff" }}>{labelPad}</span>
              <span style={{ flex: 1 }}>
                {v ? `${v.slice(0, 14)}…${v.slice(-8)}` : "—"}
              </span>
              <span
                style={{
                  color: fired ? accent : "#5a5f66",
                  fontSize: 11,
                  fontWeight: 600,
                  minWidth: 96,
                  textAlign: "right",
                  transition: "color 180ms",
                }}
              >
                {fired ? "✓ matches" : "computing…"}
              </span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "relative",
          marginTop: 14,
          fontSize: 12,
          color: "#5a5f66",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        Source bytes hashed locally with BLAKE3 ·
        <a
          href="/docs"
          style={{ color: "#0a0a0c", marginLeft: 6, textDecoration: "underline" }}
        >
          how this works
        </a>
        <span style={{ margin: "0 8px" }}>·</span>
        <a
          href="https://github.com/Pratiikpy/Settle"
          target="_blank"
          rel="noreferrer"
          style={{ color: "#0a0a0c", textDecoration: "underline" }}
        >
          run pnpm demo:parity
        </a>
      </div>

      <style>{`
        @keyframes rk-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          [aria-hidden="true"] { animation: none !important; }
        }
      `}</style>
    </section>
  );
}

function humanizeDenyCode(code: string): string {
  const map: Record<string, string> = {
    "1": "card revoked",
    "2": "amount over per-call cap",
    "3": "daily cap exhausted",
    "4": "merchant not on allowlist",
    "5": "card expired",
    "6": "capability mismatch",
    "7": "wrong USDC mint",
    "8": "policy snapshot mismatch",
  };
  return map[String(code)] ?? `code ${code}`;
}
