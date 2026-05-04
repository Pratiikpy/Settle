"use client";

/**
 * F4 — Revoked card banner.
 *
 * When a user revokes a delegated card, any scheduled_sends / auto_refill_rules
 * / round_up_rules / streaming_pacts that referenced that card become
 * orphaned — the signer fails loud (correct), but the user has no UX
 * prompt. This banner appears on every page that lists schedules
 * referencing a revoked card. Two CTAs: "pick another card" (re-bind)
 * or "delete this schedule".
 *
 * Wave 1 / Stream F4.
 */
import Link from "next/link";

interface RevokedCardBannerProps {
  /** The revoked card's pubkey, truncated for display. */
  cardPubkey: string;
  /** What kind of schedule references it (for copy). */
  scheduleKind:
    | "scheduled_send"
    | "auto_refill"
    | "round_up"
    | "allowance"
    | "streaming_pact";
  /** Where to link for "pick another card" remediation. */
  rebindHref?: string;
  /** Click handler for "delete this schedule". */
  onDelete?: () => void;
}

const KIND_COPY: Record<RevokedCardBannerProps["scheduleKind"], string> = {
  scheduled_send: "scheduled send",
  auto_refill: "auto-refill rule",
  round_up: "round-up rule",
  allowance: "allowance",
  streaming_pact: "streaming pact",
};

export function RevokedCardBanner({
  cardPubkey,
  scheduleKind,
  rebindHref,
  onDelete,
}: RevokedCardBannerProps) {
  const kindLabel = KIND_COPY[scheduleKind];
  const truncated = `${cardPubkey.slice(0, 6)}…${cardPubkey.slice(-4)}`;

  return (
    <div
      role="alert"
      className="my-3 rounded-lg border border-amber-400/30 bg-amber-50 p-4 text-sm"
      data-testid="revoked-card-banner"
    >
      <p className="font-medium text-amber-700">
        ⚠ This {kindLabel} points to a revoked card
      </p>
      <p className="mt-1 text-xs text-amber-700/80">
        Card{" "}
        <code className="font-mono text-amber-700">{truncated}</code> is revoked
        on-chain. The cron signer will fail any future fire of this rule with
        &ldquo;source card not found or revoked&rdquo;. Pick a new delegated
        card, or delete this rule.
      </p>
      <div className="mt-3 flex gap-2">
        {rebindHref && (
          <Link
            href={rebindHref}
            className="rounded-full border border-amber-400/40 bg-amber-400/[0.08] px-3 py-1 text-[11px] text-amber-700 hover:bg-amber-400/[0.16]"
          >
            Pick another card →
          </Link>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-full border border-[#a1a1aa] px-3 py-1 text-[11px] text-[#27272a] hover:bg-[#fafafa]"
          >
            Delete this {kindLabel}
          </button>
        )}
      </div>
    </div>
  );
}
