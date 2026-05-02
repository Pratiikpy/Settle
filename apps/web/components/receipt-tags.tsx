"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

/**
 * F2.11 — receipt tagging UI.
 *
 * Renders the connected wallet's tags on a receipt as removable chips
 * plus an inline input to add a new one. Tags are per-tagger (your
 * "rent" tag is invisible to other users; deleting only deletes yours)
 * so there's no collision concern.
 *
 * The component is a soft-add: if there's no connected wallet it shows
 * a hint instead of failing. Receipt detail pages drop this in below
 * the metadata block.
 */

interface ReceiptTag {
  tag: string;
  created_at: string;
}

const TAG_RE = /^[a-z0-9_-]{1,32}$/;

export function ReceiptTags({ requestId }: { requestId: string }) {
  const { publicKey, connected } = useWallet();
  const [tags, setTags] = useState<ReceiptTag[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      setTags([]);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey?.toBase58(), requestId]);

  async function load(): Promise<void> {
    if (!publicKey) return;
    try {
      const url = `/api/receipts/${encodeURIComponent(requestId)}/tags?pubkey=${encodeURIComponent(publicKey.toBase58())}`;
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) {
        setErr(`Load failed (${res.status})`);
        return;
      }
      const json = (await res.json()) as { tags?: ReceiptTag[] };
      setTags(json.tags ?? []);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function addTag(): Promise<void> {
    if (!publicKey) return;
    const tag = draft.trim().toLowerCase();
    if (!TAG_RE.test(tag)) {
      setErr("Tags: a-z, 0-9, _ or -, max 32 chars");
      return;
    }
    if (tags.some((t) => t.tag === tag)) {
      setDraft("");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/receipts/${encodeURIComponent(requestId)}/tags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pubkey: publicKey.toBase58(), tag }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        setErr(j.message ?? `Add failed (${res.status})`);
        return;
      }
      setDraft("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeTag(tag: string): Promise<void> {
    if (!publicKey) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/receipts/${encodeURIComponent(requestId)}/tags`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pubkey: publicKey.toBase58(), tag }),
      });
      if (!res.ok) {
        setErr(`Remove failed (${res.status})`);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!connected) {
    return (
      <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4 text-xs text-foreground/50">
        Connect your wallet to add private tags to this receipt.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-foreground/70">
          Your tags
        </h3>
        <span className="text-[10px] text-foreground/40">private to you</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tags.map((t) => (
          <span
            key={t.tag}
            className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/[0.08] px-2 py-1 text-[11px] text-accent"
          >
            #{t.tag}
            <button
              type="button"
              onClick={() => void removeTag(t.tag)}
              disabled={busy}
              className="text-accent/60 hover:text-accent disabled:opacity-50"
              aria-label={`remove tag ${t.tag}`}
            >
              ×
            </button>
          </span>
        ))}

        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addTag();
            }
          }}
          placeholder="add tag…"
          disabled={busy}
          className="rounded-full border border-foreground/15 bg-transparent px-3 py-1 text-[11px] outline-none focus:border-foreground/40"
          maxLength={32}
        />

        <button
          type="button"
          onClick={() => void addTag()}
          disabled={busy || !draft.trim()}
          className="rounded-full border border-foreground/15 px-3 py-1 text-[11px] hover:bg-foreground/[0.06] disabled:opacity-40"
        >
          add
        </button>
      </div>

      {err && (
        <p className="mt-2 text-[11px] text-red-400" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
