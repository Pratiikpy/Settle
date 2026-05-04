"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { asAuthHeaders, fetchAuthHeaders } from "../lib/client-auth";

/**
 * F16 — Follow / Unfollow CTA on a profile.
 *
 * On mount, fetches the current follow state via GET /api/follows/[handle]. If the
 * caller is auth-headers-shipping, the response includes is_following. Otherwise,
 * displays a Connect-to-follow CTA.
 *
 * The follow flow is wallet-sig-gated: a fresh challenge → sign → POST. Optimistic UI:
 * we flip the local state immediately on click, revert if the request fails. This
 * keeps the interaction sub-100ms even on slow networks.
 */
export function FollowButton({
  handle,
  variant = "default",
  onChange,
}: {
  handle: string;
  variant?: "default" | "compact";
  onChange?: (state: { isFollowing: boolean }) => void;
}) {
  const { connected, publicKey, signMessage } = useWallet();
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  // Hydrate initial state. We pass auth headers if available so the server can return
  // is_following=true/false; otherwise we just learn the target pubkey resolves.
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        let url = `/api/follows/${encodeURIComponent(handle)}`;
        let headers: HeadersInit = {};
        if (connected && publicKey && signMessage) {
          const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
          headers = asAuthHeaders(auth);
        }
        const res = await fetch(url, { headers });
        if (cancelled) return;
        const data = await res.json();
        if (data.ok) setIsFollowing(Boolean(data.is_following));
      } catch {
        // Non-fatal — UI just stays in "Follow" state.
      }
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [handle, connected, publicKey, signMessage]);

  async function toggle() {
    if (!connected || !publicKey || !signMessage) {
      toast.error("Connect a wallet to follow.");
      return;
    }
    if (busy) return;
    setBusy(true);
    const previous = isFollowing;
    const next = !previous;
    setIsFollowing(next); // optimistic
    try {
      const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
      const init: RequestInit = {
        method: next ? "POST" : "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...asAuthHeaders(auth),
        },
      };
      if (next) init.body = JSON.stringify({});
      const res = await fetch(`/api/follows/${encodeURIComponent(handle)}`, init);
      const data = await res.json();
      if (!data.ok) throw new Error(data.message ?? data.error ?? "follow_failed");
      setIsFollowing(Boolean(data.is_following));
      onChange?.({ isFollowing: Boolean(data.is_following) });
      toast.success(next ? `Following ${handle}` : `Unfollowed ${handle}`);
    } catch (e) {
      // Revert optimistic update.
      setIsFollowing(previous);
      toast.error(`Follow failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const label =
    isFollowing == null
      ? "…"
      : isFollowing
        ? variant === "compact"
          ? "Following ✓"
          : "Following"
        : variant === "compact"
          ? "Follow"
          : "Follow";

  const className = isFollowing
    ? "border border-[#e4e4e7] bg-[#f4f4f5] text-[#27272a] hover:bg-[#e4e4e7]"
    : "bg-accent text-background hover:bg-accent/90";

  const sizing =
    variant === "compact" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      className={`rounded-full font-medium transition disabled:opacity-50 ${className} ${sizing}`}
    >
      {busy ? "…" : label}
    </button>
  );
}
