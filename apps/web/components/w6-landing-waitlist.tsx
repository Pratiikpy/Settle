"use client";

/**
 * Wave 6.1 — landing waitlist email-capture form.
 *
 * Inline `<input> <button>` pair. Submits to `/api/waitlist`. Always
 * confirms success — never leaks whether email already exists.
 */

import { useState } from "react";

interface Props {
  source?: "landing" | "docs" | "embed";
}

export function LandingWaitlistForm({ source = "landing" }: Props) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "ok" | "err">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "submitting") return;
    setState("submitting");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source }),
      });
      if (res.status === 429) {
        setState("err");
        setErrorMsg("Too many tries. Wait a minute and retry.");
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setState("err");
        setErrorMsg(
          j.error === "validation_failed"
            ? "That doesn't look like a valid email."
            : "Couldn't reach the server. Try again.",
        );
        return;
      }
      setState("ok");
    } catch {
      setState("err");
      setErrorMsg("Couldn't reach the server. Try again.");
    }
  }

  if (state === "ok") {
    return (
      <div
        role="status"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 18px",
          borderRadius: 999,
          background: "var(--w6-ok-soft)",
          border: "1px solid rgba(22, 163, 74, 0.32)",
          color: "var(--w6-ok)",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        <span aria-hidden>✓</span>
        <span>You&apos;re on the list. We&apos;ll be in touch.</span>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: "flex", gap: 10, maxWidth: 460, flexWrap: "wrap" }}
    >
      <label htmlFor="w6-email" className="sr-only">
        Email
      </label>
      <input
        id="w6-email"
        type="email"
        required
        placeholder="you@email.com"
        autoComplete="email"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={state === "submitting"}
        className="w6-input w6-input-lg"
        style={{ flex: 1, minWidth: 220 }}
      />
      <button
        type="submit"
        disabled={state === "submitting"}
        className="w6-btn w6-btn-primary w6-btn-lg"
      >
        {state === "submitting" ? "Submitting…" : "Get early access"}
      </button>
      {errorMsg ? (
        <div
          role="alert"
          style={{
            width: "100%",
            color: "var(--w6-bad)",
            fontSize: 13,
            marginTop: 6,
          }}
        >
          {errorMsg}
        </div>
      ) : null}
    </form>
  );
}
