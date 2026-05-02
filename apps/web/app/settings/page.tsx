"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { TrustGesture } from "@settle/ui";
import { W6AppShell } from "../../components/w6-app-shell";
import { asAuthHeaders, fetchAuthHeaders } from "../../lib/client-auth";
import { fireSettlementConfetti, trustGesture } from "../../lib/confetti";
import { useTheme } from "../../components/theme-provider";
import { LOCALES, useTranslate, type Locale } from "../../lib/i18n";

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  ja: "日本語",
  "zh-CN": "中文 (简体)",
};

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
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useTranslate();

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
    <W6AppShell>
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 24,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="w6-eyebrow" style={{ fontSize: 12 }}>
              Settings
            </div>
            <h1
              className="w6-heading"
              style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.1 }}
            >
              Profile, privacy &amp; sessions
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
              Every change is signed by your wallet. Settle never sees your
              private keys; we only verify the signature.
            </p>
          </div>
        </div>

        {!connected ? (
          <div className="mt-12 rounded-2xl border border-foreground/10 bg-white/[0.02] p-10 text-center text-sm text-foreground/60">
            Connect Phantom (top right) to manage your settings.
          </div>
        ) : (
          <>
            {/* F1.3 — 5-section settings layout: Profile · Privacy · Notifications · Sessions · Developer */}
            <nav className="mt-6 flex flex-wrap gap-2 text-xs">
              {[
                { id: "profile", label: "Profile" },
                { id: "theme", label: "Theme" },
                { id: "privacy", label: "Privacy" },
                { id: "notifications", label: "Notifications" },
                { id: "sessions", label: "Sessions" },
                { id: "developer", label: "Developer" },
              ].map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="rounded-full border border-foreground/15 bg-white/[0.02] px-3 py-1 text-foreground/70 hover:border-foreground/40 hover:text-foreground"
                >
                  {s.label}
                </a>
              ))}
            </nav>

            {/* Profile */}
            <section
              id="profile"
              className="mt-8 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6"
            >
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

            {/* F1.7 — theme toggle. Lives under Profile because it's a
                personal preference not a privacy or notification one. */}
            <section
              id="theme"
              className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6"
            >
              <h2 className="text-lg font-medium">Theme</h2>
              <p className="mt-1 text-xs text-foreground/50">
                Auto follows your OS setting. Manual overrides persist across
                sessions on this browser.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(["dark", "light", "auto"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTheme(t)}
                    className={
                      theme === t
                        ? "rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-background"
                        : "rounded-full border border-foreground/20 px-4 py-1.5 text-xs text-foreground/70 hover:bg-foreground/5"
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
            </section>

            {/* Privacy */}
            <section
              id="privacy"
              className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6"
            >
              <h2 className="text-lg font-medium">Privacy</h2>
              <p className="mt-1 text-xs text-foreground/50">
                Per-card privacy toggles, allowlist edits, and revoke live on each card —
                where the on-chain state lives. The card page is the source of truth.
              </p>
              <p className="mt-3 text-xs text-foreground/50">
                Receipts default to private. Flip <code>public_feed</code> on a receipt
                to make it visible on the public feed (proofs only — amounts + plaintext
                purpose remain encrypted unless you explicitly publish them).
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href="/cards"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/20 px-5 text-xs hover:bg-foreground/5"
                >
                  Per-card privacy →
                </a>
                <a
                  href="/feed"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/20 px-5 text-xs hover:bg-foreground/5"
                >
                  Public feed
                </a>
              </div>
            </section>

            {/* Notifications */}
            <section
              id="notifications"
              className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6"
            >
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

            {/* Sessions */}
            <section
              id="sessions"
              className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6"
            >
              <h2 className="text-lg font-medium">Sessions</h2>
              <p className="mt-1 text-xs text-foreground/50">
                The wallet you connect IS the session. Settle has no server-side
                session store — every privileged action is signed by your wallet at
                the moment you take it. Disconnect Phantom to "log out."
              </p>
              <div className="mt-4 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
                <p className="text-[11px] uppercase tracking-wide text-foreground/40">
                  Active wallet
                </p>
                <code className="mt-2 block break-all text-xs text-foreground/70">
                  {publicKey?.toBase58()}
                </code>
                <p className="mt-2 text-[11px] text-foreground/40">
                  Push subscriptions, claimed handles, and saved settings are bound to
                  this pubkey. Switching wallets shows a fresh state — no migration.
                </p>
              </div>
            </section>

            {/* Language (F8.11) */}
            <section
              id="language"
              className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6"
            >
              <h2 className="text-lg font-medium">Language</h2>
              <p className="mt-1 text-xs text-foreground/50">
                Bundles ship in-app — switching is instant, no reload needed.
                Untranslated strings fall back to English so the UI never breaks.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {LOCALES.map((loc) => (
                  <button
                    key={loc}
                    onClick={() => {
                      setLocale(loc);
                      toast.success(`Language: ${LOCALE_LABELS[loc]}`);
                    }}
                    className={`rounded-full border px-4 py-2 text-xs ${
                      locale === loc
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-foreground/10 text-foreground/60 hover:border-foreground/30"
                    }`}
                  >
                    {LOCALE_LABELS[loc]}
                  </button>
                ))}
              </div>
            </section>

            {/* Developer */}
            <section
              id="developer"
              className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6"
            >
              <h2 className="text-lg font-medium">Developer</h2>
              <p className="mt-1 text-xs text-foreground/50">
                Stuff for integrating Settle into your own app or agent.
              </p>

              {/* Sealed-box recipient pubkey (B1.5) */}
              <div className="mt-4 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-[11px] uppercase tracking-wide text-foreground/40">
                    Sealed-box recipient pubkey
                  </p>
                  <button
                    onClick={() => {
                      if (!publicKey) return;
                      void navigator.clipboard
                        .writeText(publicKey.toBase58())
                        .then(() => toast.success("Copied"));
                    }}
                    className="text-[11px] text-foreground/60 hover:text-foreground"
                  >
                    copy
                  </button>
                </div>
                <code className="mt-2 block break-all text-xs text-foreground/70">
                  {publicKey?.toBase58()}
                </code>
                <p className="mt-2 text-[11px] text-foreground/40">
                  Senders use this pubkey to encrypt voice notes + sealed metadata so
                  only you (the wallet holder) can decrypt. Derived deterministically
                  from your Ed25519 wallet pubkey via X25519 — no separate keypair.
                </p>
              </div>

              <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                <a
                  href="/docs"
                  className="rounded-xl border border-foreground/10 p-4 hover:border-foreground/30"
                >
                  <p className="font-medium">SDK + API docs</p>
                  <p className="mt-1 text-foreground/50">
                    @settle/sdk, ix builders, verifyReceipt
                  </p>
                </a>
                <a
                  href="https://github.com/anthropics/settle-protocol"
                  className="rounded-xl border border-foreground/10 p-4 hover:border-foreground/30"
                  target="_blank"
                  rel="noreferrer"
                >
                  <p className="font-medium">GitHub →</p>
                  <p className="mt-1 text-foreground/50">
                    Source, IDL, Anchor program
                  </p>
                </a>
              </div>
            </section>
          </>
        )}

        <TrustGesture state={gesture} />
      </div>
    </W6AppShell>
  );
}
