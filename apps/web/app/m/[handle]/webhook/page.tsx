"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { W6AppShell } from "../../../../components/w6-app-shell";
import {
  asAuthHeaders,
  fetchAuthHeaders,
} from "../../../../lib/client-auth";

/**
 * /m/[handle]/webhook — merchant self-serve webhook URL registration.
 *
 * Auth: requires wallet sig matching the @handle. Non-merchants see
 * a 403 from the API. Verified merchants can:
 *   - Set / update the URL
 *   - Rotate the signing secret (shown ONCE on success)
 *   - Clear (delete URL + secret)
 *   - See last_delivered_at + last_error for liveness probe
 *
 * The signing secret pattern mirrors Stripe: server generates 32
 * random bytes hex, returns them once on PUT, never again. If the
 * merchant loses it, they PUT again with a new URL (or same URL +
 * rotate=true) to get a fresh one.
 */

interface WebhookState {
  merchant_pubkey: string;
  webhook_url: string | null;
  webhook_configured: boolean;
  last_delivered_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
}

export default function MerchantWebhookPage() {
  const params = useParams<{ handle: string }>();
  const router = useRouter();
  const { connected, publicKey, signMessage } = useWallet();

  // Bug #28: redirect /m/me/webhook → /m/<own-handle>/webhook when connected.
  useEffect(() => {
    if (params.handle !== "me") return;
    if (!publicKey) return;
    let cancelled = false;
    fetch(`/api/handles/by-pubkey?pubkey=${publicKey.toBase58()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { handle?: string } | null) => {
        if (cancelled) return;
        if (j?.handle) router.replace(`/m/${j.handle}/webhook`);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [params.handle, publicKey, router]);

  const [state, setState] = useState<WebhookState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [urlInput, setUrlInput] = useState("");
  const [rotateOnSave, setRotateOnSave] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!connected || !publicKey || !signMessage) return;
    setLoading(true);
    setError(null);
    try {
      const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
      const r = await fetch(`/api/merchants/${params.handle}/webhook`, {
        headers: asAuthHeaders(auth) as HeadersInit,
      });
      if (!r.ok) {
        const j = await r.json();
        setError(j.error ?? `HTTP ${r.status}${j.message ? `: ${j.message}` : ""}`);
        return;
      }
      const j = (await r.json()) as WebhookState;
      setState(j);
      if (j.webhook_url) setUrlInput(j.webhook_url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey, params.handle]);

  async function save() {
    if (!publicKey || !signMessage || !urlInput) return;
    setBusy(true);
    setRevealedSecret(null);
    try {
      const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
      const r = await fetch(`/api/merchants/${params.handle}/webhook`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...asAuthHeaders(auth),
        },
        body: JSON.stringify({
          url: urlInput,
          rotate_secret: rotateOnSave,
        }),
      });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const j = (await r.json()) as {
        webhook_signing_secret: string | null;
        rotated: boolean;
        message: string;
      };
      if (j.webhook_signing_secret) {
        setRevealedSecret(j.webhook_signing_secret);
      }
      toast.success(j.message);
      await load();
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!publicKey || !signMessage) return;
    if (!confirm("Clear the webhook URL + secret? This stops deliveries immediately.")) {
      return;
    }
    setBusy(true);
    try {
      const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
      const r = await fetch(`/api/merchants/${params.handle}/webhook`, {
        method: "DELETE",
        headers: asAuthHeaders(auth) as HeadersInit,
      });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error ?? "delete_failed");
      }
      toast.success("Webhook cleared.");
      setUrlInput("");
      setRevealedSecret(null);
      await load();
    } catch (e) {
      toast.error(`Clear failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
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
            Webhook configuration
          </h1>
          <p className="mt-2 text-sm text-[#52525b]">
            Register a URL where Settle posts a Stripe-shaped envelope every
            time a receipt addressed to your merchant pubkey lands. The
            signing secret lets you verify each delivery — same model as
            Stripe webhooks.
          </p>
        </header>

        {!connected ? (
          <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-6 text-sm text-[#52525b]">
            Connect the wallet that owns @{params.handle} to manage your
            webhook.
          </div>
        ) : loading ? (
          <p className="text-sm text-[#52525b]">Authenticating…</p>
        ) : error ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-400/[0.04] p-4 text-xs text-red-200">
            {error}
            {error.includes("not_a_verified_merchant") && (
              <p className="mt-2 text-[#52525b]">
                Webhook registration is gated to verified merchants. Verify
                your domain via DNS TXT or contact the operator.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Status panel */}
            {state?.webhook_configured ? (
              <section className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.03] p-5">
                <p className="text-[11px] uppercase tracking-wide text-emerald-400/70">
                  Webhook active
                </p>
                <code className="mt-2 block break-all text-xs text-[#27272a]">
                  {state.webhook_url}
                </code>
                <div className="mt-3 grid gap-1 text-[11px] text-[#52525b]">
                  {state.last_delivered_at ? (
                    <p>
                      ✓ last delivered{" "}
                      {new Date(state.last_delivered_at).toLocaleString()}
                    </p>
                  ) : (
                    <p>no deliveries yet</p>
                  )}
                  {state.last_error && (
                    <p className="text-red-300">
                      last error: {state.last_error}
                      {state.last_attempt_at &&
                        ` (${new Date(state.last_attempt_at).toLocaleString()})`}
                    </p>
                  )}
                </div>
              </section>
            ) : (
              <section className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-5 text-xs text-amber-200">
                No webhook configured. Receipts addressed to{" "}
                {state?.merchant_pubkey.slice(0, 6)}… won&apos;t reach any
                URL until you set one below.
              </section>
            )}

            {/* Form */}
            <section className="mb-6 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
              <h2 className="text-sm font-medium">URL</h2>
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://your-merchant.example.com/webhooks/settle"
                className="mt-3 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 font-mono text-sm"
              />
              <p className="mt-2 text-[11px] text-[#71717a]">
                HTTPS only. The endpoint must respond 2xx within 10 seconds.
                We retry 5× with exponential backoff before marking failed.
              </p>

              <label className="mt-4 flex items-center gap-2 text-xs text-[#27272a]">
                <input
                  type="checkbox"
                  checked={rotateOnSave}
                  onChange={(e) => setRotateOnSave(e.target.checked)}
                />
                <span>
                  Rotate signing secret on save{" "}
                  {state?.webhook_configured ? (
                    <span className="text-[#71717a]">
                      (existing receivers must update)
                    </span>
                  ) : (
                    <span className="text-[#71717a]">
                      (first save always rotates)
                    </span>
                  )}
                </span>
              </label>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={save}
                  disabled={busy || !urlInput}
                  className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-background disabled:opacity-50"
                >
                  {busy ? "Saving…" : state?.webhook_configured ? "Save" : "Register"}
                </button>
                {state?.webhook_configured && (
                  <button
                    onClick={clear}
                    disabled={busy}
                    className="rounded-full border border-red-400/40 bg-red-400/[0.04] px-5 py-2 text-xs text-red-200 hover:bg-red-400/10 disabled:opacity-50"
                  >
                    Clear
                  </button>
                )}
              </div>
            </section>

            {/* Secret reveal — shown ONCE after PUT with rotate=true */}
            {revealedSecret && (
              <section className="mb-6 rounded-2xl border border-emerald-400/40 bg-emerald-400/[0.05] p-5">
                <p className="text-[11px] uppercase tracking-wide text-emerald-300">
                  ⚠ Signing secret — shown ONCE
                </p>
                <code className="mt-2 block break-all rounded-lg bg-[#e4e4e7] p-3 font-mono text-xs">
                  {revealedSecret}
                </code>
                <button
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(revealedSecret)
                      .then(() => toast.success("Copied"));
                  }}
                  className="mt-3 rounded-full border border-emerald-400/40 px-4 py-1.5 text-[11px] text-emerald-200 hover:bg-emerald-400/10"
                >
                  Copy secret
                </button>
                <p className="mt-3 text-[11px] text-[#52525b]">
                  Save this in your env (e.g.{" "}
                  <code>SETTLE_WEBHOOK_SECRET</code>). Future GETs will not
                  return it. If you lose it, save the URL again with rotate
                  on to get a new one.
                </p>
              </section>
            )}

            {/* Verification recipe */}
            <section className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
              <h2 className="text-sm font-medium">Verifying deliveries</h2>
              <p className="mt-2 text-xs text-[#52525b]">
                Every webhook POST has an{" "}
                <code>X-Settle-Signature</code> header — HMAC-SHA256 over the
                raw body, hex-encoded. Recompute on your side, compare.
              </p>
              <pre className="mt-3 overflow-auto rounded-lg bg-[#fafafa] p-3 text-[11px]">
                {`import { verifyWebhookSignature } from "@settle/sdk";

const sig = req.headers["x-settle-signature"];
if (!verifyWebhookSignature(req.rawBody, sig, mySecret)) {
  throw new Error("untrusted webhook");
}`}
              </pre>
              <Link
                href="/docs#webhooks"
                className="mt-3 inline-block text-[11px] text-accent hover:underline"
              >
                Webhook docs →
              </Link>
            </section>
          </>
        )}
      </div>
    </W6AppShell>
  );
}
