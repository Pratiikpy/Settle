"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { Footer } from "../../../../components/footer";
import { asAuthHeaders, fetchAuthHeaders } from "../../../../lib/client-auth";

const SLUG_RE = /^[a-z0-9_-]{2,40}$/;
const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export default function NewTemplatePage() {
  const router = useRouter();
  const { connected, publicKey, signMessage } = useWallet();

  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [capUsdc, setCapUsdc] = useState("0.50");
  const [expiryMin, setExpiryMin] = useState(15);
  const [allowlist, setAllowlist] = useState("");
  const [purpose, setPurpose] = useState("");
  const [icon, setIcon] = useState("AI");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!connected || !publicKey || !signMessage) {
      toast.error("Connect Phantom to publish.");
      return;
    }
    if (!SLUG_RE.test(slug)) {
      toast.error("Slug must be 2-40 chars (lowercase, digits, dash, underscore).");
      return;
    }
    if (title.length < 2 || description.length < 10) {
      toast.error("Title 2+ chars, description 10+ chars.");
      return;
    }
    const cap = Number(capUsdc);
    if (!Number.isFinite(cap) || cap <= 0 || cap > 10_000) {
      toast.error("Cap must be 0–10000.");
      return;
    }
    const merchants = allowlist
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const m of merchants) {
      if (!PUBKEY_RE.test(m)) {
        toast.error(`Bad pubkey: ${m.slice(0, 12)}…`);
        return;
      }
    }
    if (merchants.length > 20) {
      toast.error("Max 20 merchants.");
      return;
    }

    setSubmitting(true);
    try {
      const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...asAuthHeaders(auth) },
        body: JSON.stringify({
          slug,
          title,
          description,
          cap_usdc: cap,
          expiry_minutes: expiryMin,
          merchant_allowlist: merchants,
          default_purpose: purpose,
          icon_emoji: icon,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "publish_failed");
      toast.success("Template published.");
      router.push(`/agents/templates/${slug}`);
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Publish an agent template</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Open-source recipe. Author signature stays on your wallet — anyone can audit it.
        </p>

        <div className="mt-8 grid gap-4">
          <Field label="Slug (URL-safe)">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="content-research"
              className="input"
            />
          </Field>
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Content Research Assistant"
              className="input"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What does this agent do? What does it spend on?"
              className="input"
            />
          </Field>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Cap (USDC)">
              <input
                value={capUsdc}
                onChange={(e) => setCapUsdc(e.target.value)}
                inputMode="decimal"
                className="input"
              />
            </Field>
            <Field label="Expiry (min)">
              <input
                value={expiryMin}
                onChange={(e) => setExpiryMin(Number(e.target.value))}
                type="number"
                min={1}
                max={10080}
                className="input"
              />
            </Field>
            <Field label="Icon (1-3 chars)">
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value.slice(0, 3).toUpperCase())}
                className="input"
              />
            </Field>
          </div>
          <Field label="Merchant allowlist (one pubkey per line — leave blank for none)">
            <textarea
              value={allowlist}
              onChange={(e) => setAllowlist(e.target.value)}
              rows={4}
              placeholder="ArxvFetch1111111111111111111111111111111111\nTrns111111111111111111111111111111111111111"
              className="input font-mono text-xs"
            />
          </Field>
          <Field label="Default purpose (optional)">
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Research a topic end-to-end"
              className="input"
            />
          </Field>
        </div>

        <button
          onClick={() => void handleSubmit()}
          disabled={!connected || submitting}
          className="mt-8 w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
        >
          {!connected ? "Connect Phantom to publish" : submitting ? "Signing & publishing…" : "Publish template"}
        </button>

        <style jsx>{`
          :global(.input) {
            width: 100%;
            border-radius: 0.5rem;
            border: 1px solid rgb(var(--foreground-rgb, 245 245 245) / 0.15);
            background: transparent;
            padding: 0.625rem 1rem;
            font-size: 0.875rem;
            outline: none;
          }
          :global(.input:focus) {
            border-color: rgb(153 69 255);
          }
        `}</style>
      </main>
      <Footer />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-foreground/60">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
