"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { W6AppShell } from "../../../../components/w6-app-shell";
import {
  asAuthHeaders,
  fetchAuthHeaders,
} from "../../../../lib/client-auth";

/**
 * /m/[handle]/verify — DNS TXT domain verification flow.
 *
 * Two-step:
 *   1. Init: server issues a token bound to (handle, domain). The page
 *      shows the TXT record name + value the merchant must publish.
 *   2. Check: after the merchant publishes, they click Verify. Server
 *      fetches DNS, compares, and on match writes verified_merchants.
 *
 * Auth: only the wallet that owns @handle can run this. Same wallet-sig
 * pattern as /m/[handle]/webhook.
 */

interface InitResponse {
  txt_record_name: string;
  txt_record_value: string;
  expires_at: string;
}

interface CheckResponse {
  verified: boolean;
  domain: string;
  message: string;
}

export default function MerchantVerifyDomainPage() {
  const params = useParams<{ handle: string }>();
  const { connected, publicKey, signMessage } = useWallet();

  const [domain, setDomain] = useState("");
  const [txtRecord, setTxtRecord] = useState<InitResponse | null>(null);
  const [verified, setVerified] = useState<CheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function init() {
    if (!publicKey || !signMessage || !domain) return;
    setBusy(true);
    setError(null);
    try {
      const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
      const r = await fetch("/api/merchants/verify-domain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...asAuthHeaders(auth),
        },
        body: JSON.stringify({
          handle: params.handle,
          domain: domain.toLowerCase().trim(),
          action: "init",
        }),
      });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const j = (await r.json()) as InitResponse;
      setTxtRecord(j);
      setVerified(null);
      toast.success("Token issued. Add the TXT record, then verify.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    if (!publicKey || !signMessage || !domain) return;
    setBusy(true);
    setError(null);
    try {
      const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
      const r = await fetch("/api/merchants/verify-domain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...asAuthHeaders(auth),
        },
        body: JSON.stringify({
          handle: params.handle,
          domain: domain.toLowerCase().trim(),
          action: "check",
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        const msg = j.hint ?? j.error ?? `HTTP ${r.status}`;
        throw new Error(msg);
      }
      setVerified(j as CheckResponse);
      toast.success(j.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
  }

  return (
    <W6AppShell forceSurface="merchant">
      <div style={{ maxWidth: 720 }}>
        <header style={{ marginBottom: 28 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Merchant · @{params.handle}
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            Verify your domain
          </h1>
          <p className="mt-2 text-sm text-foreground/60">
            Add a DNS TXT record at <code>_settle.&lt;your-domain&gt;</code>{" "}
            to prove control. After verification you can register webhooks
            and capabilities under this handle.
          </p>
        </header>

        {!connected ? (
          <p className="text-sm text-foreground/60">
            Connect the wallet that owns @{params.handle}.
          </p>
        ) : (
          <>
            {/* Step 1: domain entry */}
            <section className="mb-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-5">
              <h2 className="text-sm font-medium">1. Domain</h2>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="your-merchant.example.com"
                className="mt-3 w-full rounded-lg border border-foreground/10 bg-transparent px-3 py-2 font-mono text-sm"
              />
              <button
                onClick={init}
                disabled={busy || !domain}
                className="mt-3 rounded-full border border-foreground/20 px-4 py-1.5 text-xs hover:bg-foreground/5 disabled:opacity-50"
              >
                {busy ? "Issuing token…" : "Issue verification token"}
              </button>
            </section>

            {/* Step 2: TXT record reveal */}
            {txtRecord && (
              <section className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-5">
                <h2 className="text-sm font-medium">2. Add this TXT record</h2>
                <p className="mt-2 text-[11px] text-foreground/60">
                  Token expires{" "}
                  {new Date(txtRecord.expires_at).toLocaleString()}.
                </p>
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-foreground/40">
                      Record name
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 break-all rounded-lg bg-foreground/[0.04] px-3 py-2 font-mono text-xs">
                        {txtRecord.txt_record_name}
                      </code>
                      <button
                        onClick={() => copy(txtRecord.txt_record_name)}
                        className="rounded-full border border-foreground/20 px-3 py-1 text-[11px]"
                      >
                        copy
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-foreground/40">
                      Record value
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 break-all rounded-lg bg-foreground/[0.04] px-3 py-2 font-mono text-xs">
                        {txtRecord.txt_record_value}
                      </code>
                      <button
                        onClick={() => copy(txtRecord.txt_record_value)}
                        className="rounded-full border border-foreground/20 px-3 py-1 text-[11px]"
                      >
                        copy
                      </button>
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-[11px] text-foreground/50">
                  Most DNS providers (Cloudflare, Route53, Namecheap) propagate
                  TXT changes within 1-5 minutes.
                </p>
              </section>
            )}

            {/* Step 3: check */}
            {txtRecord && (
              <section className="mb-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-5">
                <h2 className="text-sm font-medium">3. Verify</h2>
                <p className="mt-2 text-xs text-foreground/60">
                  We fetch the TXT record and compare. On match, we mark you
                  verified for this domain.
                </p>
                <button
                  onClick={check}
                  disabled={busy}
                  className="mt-3 rounded-full bg-accent px-5 py-2 text-xs font-medium text-background disabled:opacity-50"
                >
                  {busy ? "Checking DNS…" : "Verify"}
                </button>
              </section>
            )}

            {/* Result */}
            {verified && (
              <section className="mb-6 rounded-2xl border border-emerald-400/40 bg-emerald-400/[0.04] p-5">
                <p className="text-sm font-medium text-emerald-200">
                  ✓ Verified
                </p>
                <p className="mt-2 text-xs text-foreground/70">
                  {verified.domain} is now bound to your merchant pubkey.
                  You can register webhooks + capabilities.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                  <Link
                    href={`/m/${params.handle}/webhook`}
                    className="rounded-full border border-foreground/20 px-3 py-1.5 text-foreground/70 hover:bg-foreground/5"
                  >
                    Register webhook →
                  </Link>
                  <Link
                    href={`/m/${params.handle}/capabilities`}
                    className="rounded-full border border-foreground/20 px-3 py-1.5 text-foreground/70 hover:bg-foreground/5"
                  >
                    Publish capabilities →
                  </Link>
                </div>
              </section>
            )}

            {error && (
              <div className="rounded-2xl border border-red-400/30 bg-red-400/[0.04] p-4 text-xs text-red-200">
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </W6AppShell>
  );
}
