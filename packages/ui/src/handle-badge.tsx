/** @handle / .sol display badge with optional copy-on-click. */
export interface HandleBadgeProps {
  handle: string;          // "@pratiik"
  domain?: string;         // "pratiik.sol"
  copyable?: boolean;
  size?: "sm" | "md";
}

export function HandleBadge({ handle, domain, copyable, size = "md" }: HandleBadgeProps) {
  const padding = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs";

  function handleCopy() {
    if (!copyable || typeof navigator === "undefined") return;
    void navigator.clipboard?.writeText(domain ?? handle);
  }

  return (
    <button
      onClick={handleCopy}
      disabled={!copyable}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 font-medium text-white/80 transition",
        padding,
        copyable ? "hover:bg-white/10" : "cursor-default",
      ].join(" ")}
      title={copyable ? "Copy" : undefined}
    >
      <span>{handle}</span>
      {domain && <span className="text-white/40">· {domain}</span>}
    </button>
  );
}
