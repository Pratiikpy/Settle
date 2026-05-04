"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha2";
import { toast } from "sonner";
import { W6AppShell } from "../../../components/w6-app-shell";
import {
  buildInitCrosschainCardIxData,
  type CrosschainAllowlistEntryArgs,
} from "../../../lib/ika/build-ix";
import { findCrosschainCardPda } from "../../../lib/ika/find-pda";
import { evmAddressBytes, hexToBytes0x } from "@settle/sdk";
import { sepolia } from "../../../lib/ika/chains";
import { SETTLE_DWALLET_ROUTER_PROGRAM_ID } from "../../../lib/ika/program-ids";

/**
 * /start/agent-crosschain — entry point for the cross-chain agent flow.
 *
 * Bring-Your-Own-dWallet (BYO-dWallet) mode for v0.4: the user pastes the
 * pubkey of a dWallet they've already created via Ika's reference DKG tools
 * (or any external Ika-compatible client). The UI here only handles
 * `init_crosschain_card` — DKG creation from the browser lands in v0.5 once
 * we wire `@connectrpc/connect-web` for the SubmitTransaction RPC.
 *
 * This is documented honestly to users — the form has a "Where do I get a
 * dWallet?" link that explains the BYO step.
 *
 * Day-1 scope: Ethereum Sepolia only. Chain dropdown is wired but only Sepolia
 * is enabled. Adding more chains is mechanical (edit `lib/ika/chains.ts`).
 */

const ROUTER = new PublicKey(SETTLE_DWALLET_ROUTER_PROGRAM_ID);

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HEX_RE = /^(0x)?[0-9a-fA-F]+$/;
const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export default function StartCrosschainAgentPage() {
  const router = useRouter();
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  // Form state
  const [label, setLabel] = useState("My Sepolia agent");
  const [dwalletPubkey, setDwalletPubkey] = useState("");
  const [dwalletKeyHex, setDwalletKeyHex] = useState("");
  const [recipient, setRecipient] = useState("");
  const [perCallEth, setPerCallEth] = useState("0.01");
  const [dailyEth, setDailyEth] = useState("0.05");
  const [expiryHours, setExpiryHours] = useState("24");
  const [busy, setBusy] = useState(false);

  // Validation
  const errors = useMemo(() => {
    const errs: string[] = [];
    if (label.trim().length === 0) errs.push("Label can't be empty.");
    if (!PUBKEY_RE.test(dwalletPubkey))
      errs.push("dWallet pubkey must be a base58 Solana account (32–44 chars).");
    if (!HEX_RE.test(dwalletKeyHex.replace(/^0x/, "")) || ![64, 66].includes(dwalletKeyHex.replace(/^0x/, "").length))
      errs.push("dWallet public key (hex) must be 32 or 33 bytes (64 or 66 hex chars).");
    if (!EVM_ADDR_RE.test(recipient))
      errs.push("Recipient must be a 20-byte EVM address (0x + 40 hex chars).");
    const perCallVal = Number(perCallEth);
    const dailyVal = Number(dailyEth);
    if (!isFinite(perCallVal) || perCallVal <= 0) errs.push("Per-call cap must be > 0.");
    if (!isFinite(dailyVal) || dailyVal <= 0) errs.push("Daily cap must be > 0.");
    if (perCallVal > dailyVal) errs.push("Per-call cap can't exceed daily cap.");
    const expiryNum = Number(expiryHours);
    if (!Number.isInteger(expiryNum) || expiryNum < 1 || expiryNum > 24 * 30)
      errs.push("Expiry must be 1–720 hours.");
    return errs;
  }, [label, dwalletPubkey, dwalletKeyHex, recipient, perCallEth, dailyEth, expiryHours]);

  async function onSubmit() {
    if (errors.length > 0 || !connected || !publicKey || !signTransaction) {
      toast.error(errors[0] ?? "Connect a wallet first.");
      return;
    }
    setBusy(true);
    try {
      // Convert ETH to wei minor units
      const toWei = (eth: string): bigint => {
        const parts = eth.split(".");
        const whole = parts[0] ?? "0";
        const frac = parts[1] ?? "";
        const padded = (frac + "0".repeat(18)).slice(0, 18);
        return BigInt(whole.length === 0 ? "0" : whole) * 10n ** 18n + BigInt(padded);
      };
      const perCallMinor = toWei(perCallEth);
      const dailyMinor = toWei(dailyEth);

      // label_hash = SHA-256(label utf-8)
      const labelHash = sha256(new TextEncoder().encode(label));

      // dWallet identity
      const dwalletPk = new PublicKey(dwalletPubkey);
      const dwalletKey = hexToBytes0x(dwalletKeyHex);

      // Allowlist entry: recipient on Sepolia, native ETH, no capability pin
      const chainNamespace = padTo16("eip155");
      const chainReference = padTo32("11155111");
      const recipientBytes = padBytesTo32(evmAddressBytes(recipient));
      const allowlist: CrosschainAllowlistEntryArgs[] = [
        {
          chainNamespace,
          chainReference,
          recipientKind: 1, // evm_address
          recipient: recipientBytes,
          assetKind: 0, // native
          asset: new Uint8Array(32),
          capabilityHash: new Uint8Array(32),
        },
      ];

      // Compute expiry slot (rough — current_slot + hours×9000 slots/hour at 0.4s/slot)
      const currentSlot = await connection.getSlot("confirmed");
      const expirySlot = BigInt(currentSlot) + BigInt(Number(expiryHours)) * 9_000n;

      const ixData = buildInitCrosschainCardIxData({
        labelHash,
        agentPubkey: publicKey.toBytes(),
        dwalletPubkey: dwalletPk.toBytes(),
        gasDepositPubkey: PublicKey.default.toBytes(), // shared deposit; off-chain top-up
        dailyCapMinor: dailyMinor,
        perCallMaxMinor: perCallMinor,
        expirySlot,
        allowlist,
      });

      const [cardPda] = findCrosschainCardPda(publicKey, labelHash);

      const ix = new TransactionInstruction({
        programId: ROUTER,
        keys: [
          { pubkey: cardPda, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: false },
          { pubkey: publicKey, isSigner: true, isWritable: true }, // payer
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: ixData,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      await connection.confirmTransaction(sig, "confirmed");

      toast.success("Cross-chain card active");
      // Use suppressed value so eslint doesn't flag unused dwalletKey — it would
      // be passed to a future DKG-online flow; for BYO we only use the pubkey
      // pasted by the user (dwalletKey hex is recorded for future Ika ix calls).
      void dwalletKey;
      // Navigate to the card detail page.
      router.push(`/cards/crosschain/${cardPda.toBase58()}`);
    } catch (err) {
      console.warn("[start/agent-crosschain] init failed:", err);
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <W6AppShell>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: 24 }} data-testid="start-agent-crosschain">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Link href="/start" style={{ fontSize: 13, opacity: 0.7 }}>← all start flows</Link>
          <span
            data-testid="ika-badge"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              padding: "4px 8px",
              borderRadius: 6,
              background: "rgba(99,102,241,0.12)",
              color: "rgb(99,102,241)",
              border: "1px solid rgba(99,102,241,0.3)",
            }}
          >
            IKA
          </span>
        </div>

        <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 12 }}>
          Hire a cross-chain agent.
        </h1>
        <p style={{ marginTop: 12, fontSize: 16, lineHeight: 1.5, opacity: 0.7, maxWidth: 600 }}>
          Solana defines the policy. Ika enforces custody and signing across chains.
          Settle shows proof of what was allowed, blocked, signed, and executed.
        </p>

        <div
          data-testid="pre-alpha-banner"
          style={{
            marginTop: 24,
            padding: "12px 14px",
            background: "rgba(245,158,11,0.06)",
            border: "1px solid rgba(245,158,11,0.25)",
            borderRadius: 10,
            fontSize: 13,
            color: "rgb(180,120,20)",
          }}
        >
          Ika is in pre-alpha on Solana devnet. Signing uses a single mock signer,
          not real distributed MPC. Your assets stay on their native chain — no bridge deposit.
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
          style={{ marginTop: 28, display: "grid", gap: 16 }}
        >
          <Field label="Card label">
            <input
              data-testid="cc-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Target chain">
            <select disabled value="sepolia" style={inputStyle} data-testid="cc-chain">
              <option value="sepolia">{sepolia.displayName} ({sepolia.caipChainId})</option>
            </select>
            <span style={hintStyle}>
              Sepolia only on day 1. Bitcoin signet and Sui devnet can plug in once Phase F E2E proves the Sepolia path.
            </span>
          </Field>

          <Field label="dWallet pubkey (Solana base58)">
            <input
              data-testid="cc-dwallet-pubkey"
              value={dwalletPubkey}
              onChange={(e) => setDwalletPubkey(e.target.value)}
              placeholder="Bring-your-own dWallet — paste the account you created via Ika tooling"
              style={inputStyle}
            />
            <span style={hintStyle}>
              v0.4 is BYO-dWallet. <a
                href="https://github.com/dwallet-labs/ika-pre-alpha#quick-start"
                target="_blank"
                rel="noreferrer"
                style={{ color: "rgb(99,102,241)" }}
              >
                Where do I get one?
              </a>
            </span>
          </Field>

          <Field label="dWallet public key (hex, 32 or 33 bytes)">
            <input
              data-testid="cc-dwallet-key-hex"
              value={dwalletKeyHex}
              onChange={(e) => setDwalletKeyHex(e.target.value)}
              placeholder="0x... — the dWallet's signing key, used to derive MessageApproval PDAs"
              style={inputStyle}
            />
          </Field>

          <Field label="Allowed recipient on Sepolia">
            <input
              data-testid="cc-recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0xabcdef0123456789abcdef0123456789abcdef01"
              style={inputStyle}
            />
            <span style={hintStyle}>Agent can only send to this address. Native ETH, no token contracts.</span>
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 16 }}>
            <Field label="Per-call cap (ETH)">
              <input
                data-testid="cc-per-call-eth"
                value={perCallEth}
                onChange={(e) => setPerCallEth(e.target.value)}
                inputMode="decimal"
                style={inputStyle}
              />
            </Field>
            <Field label="Daily cap (ETH)">
              <input
                data-testid="cc-daily-eth"
                value={dailyEth}
                onChange={(e) => setDailyEth(e.target.value)}
                inputMode="decimal"
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Expiry (hours from now)">
            <input
              data-testid="cc-expiry-hours"
              value={expiryHours}
              onChange={(e) => setExpiryHours(e.target.value)}
              inputMode="numeric"
              style={inputStyle}
            />
            <span style={hintStyle}>1–720. Sign requests after this slot return Expired with no signature.</span>
          </Field>

          {errors.length > 0 ? (
            <ul data-testid="cc-form-errors" style={{ margin: 0, paddingLeft: 16, color: "rgb(220,80,80)", fontSize: 13 }}>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}

          <button
            data-testid="cc-hire-agent"
            type="submit"
            disabled={busy || errors.length > 0 || !connected}
            className="w6-btn w6-btn-primary w6-btn-lg"
            style={{ width: "100%", justifyContent: "center", borderRadius: 12, fontWeight: 700 }}
          >
            {!connected
              ? "Connect wallet first"
              : busy
                ? "Initialising card on devnet…"
                : "Hire agent →"}
          </button>
        </form>

        <footer
          style={{
            marginTop: 36,
            paddingTop: 18,
            borderTop: "1px solid rgba(0,0,0,0.08)",
            fontSize: 12,
            opacity: 0.6,
            lineHeight: 1.5,
          }}
        >
          Settle does not custody your cross-chain assets. Your funds stay on their native chain. Your dWallet's
          private key is split between you and the Ika network using 2PC-MPC. When your agent attempts a payment,
          Settle's Solana program evaluates your policy. If the policy passes, Settle approves the signing request
          via CPI; Ika produces the signature; you broadcast it on the target chain. If the policy fails, no
          signature is ever produced and a deny receipt is sealed on Solana.
        </footer>
      </div>
    </W6AppShell>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  fontSize: 14,
  fontFamily: "inherit",
  width: "100%",
  background: "white",
  color: "inherit",
};

const hintStyle: React.CSSProperties = {
  display: "block",
  marginTop: 6,
  fontSize: 12,
  opacity: 0.6,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}

function padTo16(s: string): Uint8Array {
  const b = new Uint8Array(16);
  const src = new TextEncoder().encode(s);
  if (src.length > 16) throw new Error(`string too long: ${s}`);
  b.set(src, 0);
  return b;
}
function padTo32(s: string): Uint8Array {
  const b = new Uint8Array(32);
  const src = new TextEncoder().encode(s);
  if (src.length > 32) throw new Error(`string too long: ${s}`);
  b.set(src, 0);
  return b;
}
function padBytesTo32(src: Uint8Array): Uint8Array {
  if (src.length > 32) throw new Error("recipient too long");
  const b = new Uint8Array(32);
  b.set(src, 32 - src.length);
  return b;
}
