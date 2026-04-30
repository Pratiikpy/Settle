"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { TrustGesture } from "@settle/ui";
import { Footer } from "../../components/footer";
import { asAuthHeaders, fetchAuthHeaders } from "../../lib/client-auth";
import { fireSettlementConfetti, trustGesture } from "../../lib/confetti";

interface CurrentHandle {
  handle: string;
  display_name: string | null;
  sns_domain: string | null;
}

export default function SettingsPage() {
  const { connected, publicKey, signMessage } = useWallet();
  const [currentHandle, setCurrentHandle] = useState<CurrentHandle | null>(null);
  const [handleInput, setHandleInput] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [snsDomain, setSnsDomain] = useState("");
  const [gesture, setGesture] = useState<
    "idle" | "signing" | "confirming" | "success" | "error"
  >("idle");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!connected || !publicKey) return;
    void fetch(`/api/resolve?handle=${publicKey.toBase58()}`)
      .then(async (r) => {
        if (!r.ok) return;
        // resolve always returns kind="pubkey" for a raw pubkey, so we look up by pubkey via handles table directly
      });
    void fetch(`/api/handles/by-pubkey?pubkey=${publicKey.toBase58()}`)
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        if (data.handle) {
          setCurrentHandle({
            handle: data.handle,
            display_name: data.display_name,
            sns_domain: data.sns_domain,
          });
          setHandleInput(data.handle);
          setDisplayName(data.display_name ?? "");
          setSnsDomain(data.sns_domain ?? "");
        }
      });
  }, [connected, publicKey]);

  async function handleClaim() {
    if (!connected || !publicKey || !signMessage) {
      toast.error("Connect Phantom first.");
      return;
    }
    if (!handleInput.trim()) {
      toast.error("Enter a handle.");
      return;
    }
    if (!/^[a-z0-9_-]{2,32}$/.test(handleInput.toLowerCase())) {
      toast.error("Invalid handle. Use 2-32 lowercase letters, numbers, dashes, underscores.");
      return;
    }

    trustGesture();
    setGesture("signing");
    setLoading(true);
    try {
      const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
      setGesture("confirming");

      const res = await fetch("/api/handles/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...asAuthHeaders(auth),
        },
        body: JSON.stringify({
          handle: handleInput.toLowerCase(),
          display_name: displayName.trim() || undefined,
          sns_domain: snsDomain.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "claim_failed");
      }
      setGesture("success");
      fireSettlementConfetti();
      toast.success(
        data.action === "renamed" ? "Handle updated." : `@${handleInput} claimed.`,
      );
      setCurrentHandle({
        handle: data.handle,
        display_name: displayName.trim() || null,
        sns_domain: snsDomain.trim() || null,
      });
    } catch (e) {
      setGesture("error");
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setGesture("idle"), 2400);
    }
  }

  return (
    <>
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Wallet-signed changes only. Settle never sees your private keys.
        </p>

        {!connected ? (
          <div className="mt-12 rounded-2xl border border-foreground/10 bg-white/[0.02] p-10 text-center text-sm text-foreground/60">
            Connect Phantom (top right) to manage your settings.
          </div>
        ) : (
          <>
            {/* Handle */}
            <section className="mt-10 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6">
              <h2 className="text-lg font-medium">@handle</h2>
              <p className="mt-1 text-xs text-foreground/50">
                Your public name. People can send you money via @handle. Lowercase only.
              </p>
              <div className="mt-4 grid gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-foreground/50">@</span>
                  <input
                    value={handleInput}
                    onChange={(e) => setHandleInput(e.target.value)}
                    placeholder="pratiik"
                    className="flex-1 rounded-lg border border-foreground/15 bg-transparent px-4 py-2 text-base outline-none focus:border-accent"
                  />
                </div>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display name (optional)"
                  className="rounded-lg border border-foreground/15 bg-transparent px-4 py-2 text-sm outline-none focus:border-accent"
                />
                <input
                  value={snsDomain}
                  onChange={(e) => setSnsDomain(e.target.value)}
                  placeholder="<name>.sol domain (optional)"
                  className="rounded-lg border border-foreground/15 bg-transparent px-4 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
              <button
                onClick={() => void handleClaim()}
                disabled={loading || !handleInput.trim()}
                className="mt-4 w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
              >
                {currentHandle ? "Update handle" : `Claim @${handleInput || "handle"}`}
              </button>
              {currentHandle && (
                <p className="mt-3 text-xs text-foreground/40">
                  Currently @{currentHandle.handle}
                </p>
              )}
            </section>

            {/* Wallet info */}
            <section className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6">
              <h2 className="text-lg font-medium">Wallet</h2>
              <div className="mt-3 text-xs">
                <code className="break-all text-foreground/60">{publicKey?.toBase58()}</code>
              </div>
            </section>

            {/* Pointers to other settings */}
            <section className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6">
              <h2 className="text-lg font-medium">Per-card settings</h2>
              <p className="mt-1 text-xs text-foreground/50">
                Privacy toggles, allowlist edits, and revoke live on each card.
              </p>
              <a
                href="/cards"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-foreground/20 px-5 text-xs hover:bg-foreground/5"
              >
                Open my cards →
              </a>
            </section>

            {/* Notifications */}
            <section className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6">
              <h2 className="text-lg font-medium">Notifications</h2>
              <p className="mt-1 text-xs text-foreground/50">
                Get a browser notification when an agent task completes or someone sends you
                money. End-to-end encrypted to your device — Settle&apos;s server can&apos;t
                read the payload.
              </p>
              <button
                onClick={async () => {
                  if (!publicKey || !signMessage) {
                    toast.error("Connect Phantom first.");
                    return;
                  }
                  if (
                    typeof window === "undefined" ||
                    !("serviceWorker" in navigator) ||
                    !("PushManager" in window)
                  ) {
                    toast.error("Web Push not supported in this browser.");
                    return;
                  }

                  const cfgRes = await fetch("/api/notifications/subscribe");
                  const cfg = (await cfgRes.json()) as {
                    configured: boolean;
                    public_key: string | null;
                  };
                  if (!cfg.configured || !cfg.public_key) {
                    toast.error("Push not configured server-side.");
                    return;
                  }

                  const perm = await Notification.requestPermission();
                  if (perm !== "granted") {
                    toast.error("Permission denied.");
                    return;
                  }

                  try {
                    const reg = await navigator.serviceWorker.register("/sw.js");
                    await navigator.serviceWorker.ready;
                    const existing = await reg.pushManager.getSubscription();
                    if (existing) await existing.unsubscribe();

                    function urlB64ToUint8(s: string): Uint8Array {
                      const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
                      const raw = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
                      const out = new Uint8Array(raw.length);
                      for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
                      return out;
                    }

                    const keyBytes = urlB64ToUint8(cfg.public_key);
                    const keyBuffer = keyBytes.buffer.slice(
                      keyBytes.byteOffset,
                      keyBytes.byteOffset + keyBytes.byteLength,
                    ) as ArrayBuffer;
                    const sub = await reg.pushManager.subscribe({
                      userVisibleOnly: true,
                      applicationServerKey: keyBuffer,
                    });

                    const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
                    const json = sub.toJSON() as {
                      endpoint: string;
                      keys: { p256dh: string; auth: string };
                    };
                    const res = await fetch("/api/notifications/subscribe", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...asAuthHeaders(auth),
                      },
                      body: JSON.stringify({
                        endpoint: json.endpoint,
                        keys: json.keys,
                        user_agent: navigator.userAgent,
                      }),
                    });
                    if (!res.ok) {
                      const err = await res.json();
                      throw new Error(err.error ?? "subscribe_failed");
                    }
                    toast.success("Notifications enabled. We'll ping when receipts land.");
                  } catch (e) {
                    toast.error(`Failed: ${(e as Error).message}`);
                  }
                }}
                className="mt-3 inline-flex h-10 items-center justify-center rounded-full bg-accent px-5 text-xs font-medium text-background"
              >
                Enable push
              </button>
            </section>
          </>
        )}

        <TrustGesture state={gesture} />
      </main>
      <Footer />
    </>
  );
}
