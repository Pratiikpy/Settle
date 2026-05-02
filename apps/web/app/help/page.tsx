import type { Metadata } from "next";
import { W6AppShell } from "../../components/w6-app-shell";

export const metadata: Metadata = {
  title: "Help — Settle",
  description: "Common questions about sending money, hiring AI agents, and verifying receipts.",
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is Settle on mainnet?",
    a: "Right now Settle runs on Solana devnet for the Solana Frontier Hackathon. The same code, the same Anchor program, the same hash chain — just on the test cluster so we can iterate fast without spending real USDC. Migrating to mainnet only requires updating the cluster, USDC mint, and merkle-tree authority. See MAINNET_MIGRATION.md in the repo.",
  },
  {
    q: "What is a Pact card?",
    a: "A Pact is a child of your main Agent Card with a hard cap, a merchant allowlist, and an expiry. It exists on-chain as a PDA. When the agent spends, the Anchor program checks the Pact's cap, allowlist, and expiry — not the parent card's. Close the Pact and any unspent USDC stays with you.",
  },
  {
    q: "Can the agent steal my money?",
    a: "Not more than the Pact's cap. Even with full agent credentials, the Anchor program rejects any spend over the cap, outside the allowlist, or after expiry. You can revoke a card on-chain at any time.",
  },
  {
    q: "What is a receipt?",
    a: "Every successful spend writes three BLAKE3 hashes on-chain: the receipt hash, the reason hash, and the policy snapshot hash. Plus a fourth purpose hash that binds them all to the request context (HTTP method, path, amount, capability). Anyone with the verify SDK can recompute the chain and prove the spend was authorized.",
  },
  {
    q: "Why hashes instead of full data?",
    a: "Storage on Solana is expensive. Hashes are 32 bytes each. The full data — purpose text, deliverable, policy snapshot — lives in Supabase, encrypted with a sealed box only you can open. The chain stays cheap; the off-chain data stays private; the audit trail stays cryptographic.",
  },
  {
    q: "What's a deny code?",
    a: "Eight reasons a spend can be rejected: 1 RevokedCard, 2 Expired, 3 NotInAllowlist, 4 OverCap, 5 OverPerCallMax, 6 DuplicateOrLoopDetected, 7 CapabilityNotPinned, 8 MerchantNotVerified. They're recorded on-chain via record_denial so denials are auditable too.",
  },
  {
    q: "How do send-via-link claims work?",
    a: "Settle generates a fresh keypair, you fund its USDC ATA, and the claim secret lives in the URL fragment after #. Browsers strip fragments from HTTP requests, so the secret never hits our servers. Whoever opens the URL signs a co-signed transaction that drains the escrow and refunds rent. Treat the link like cash.",
  },
  {
    q: "Are notifications private?",
    a: "Yes. Web Push messages are encrypted end-to-end with a per-device key your browser generates. Even Settle's server can't read the payload after it's sent — only your service worker can decrypt it.",
  },
];

export default function HelpPage() {
  return (
    <W6AppShell forceSurface="public">
      <div style={{ maxWidth: 760 }}>
        <div style={{ marginBottom: 32 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Help
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            The most common questions.
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
            Need more? Open an issue on GitHub.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="w6-card"
              style={{ padding: 20 }}
            >
              <summary
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  cursor: "pointer",
                  fontSize: 15,
                  fontWeight: 500,
                  listStyle: "none",
                }}
              >
                {item.q}
                <span
                  className="w6-muted"
                  style={{ fontSize: 18, transition: "transform 0.2s" }}
                >
                  +
                </span>
              </summary>
              <p
                className="w6-muted"
                style={{
                  marginTop: 12,
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </W6AppShell>
  );
}
