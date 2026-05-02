"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { W6AppShell } from "../../../components/w6-app-shell";

/**
 * F7.12 — Voice / NLP send.
 *
 * Two paths to the same intent:
 *   1. Hold-to-record voice → /api/voice/transcribe → /api/intent/parse
 *   2. Type a sentence → /api/intent/parse directly
 *
 * Both end at the same review screen — handle resolved, amount filled,
 * note populated. Confirm sends the user to /send with prefilled query
 * params; the existing /send page handles the actual tx build/sign.
 *
 * We split the journey deliberately:
 *   - This page = intent (what the user means).
 *   - /send = decision (what gets signed).
 * It mirrors how good banking apps separate "tell me what to do" from
 * "approve this exact transfer." The user sees BOTH; the second is
 * never skipped, even when the first is dead-confident.
 */

interface Intent {
  action: "direct_send" | "save_for" | "schedule" | "unknown";
  recipient_handle: string | null;
  recipient_pubkey: string | null;
  amount_usdc: string | null;
  amount_lamports: string | null;
  note: string | null;
  confidence: number;
  needs_confirmation: boolean;
  cadence?: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  goal_label?: string | null;
}

export default function VoiceSendPage() {
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [transcript, setTranscript] = useState("");
  const [textIntent, setTextIntent] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Cleanup mic when leaving the page mid-recording.
  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startRecording() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      toast.error("Microphone not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        void transcribeAndParse(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (e) {
      toast.error(`Mic access denied: ${(e as Error).message}`);
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function transcribeAndParse(audio: Blob) {
    setBusy(true);
    setBusyLabel("Transcribing…");
    try {
      const form = new FormData();
      form.append("audio", audio, "voice.webm");
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `transcribe_failed_${res.status}`);
      }
      const { text } = (await res.json()) as { text: string };
      setTranscript(text);
      await parseIntent(text);
    } catch (e) {
      toast.error(`Voice failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }

  async function parseIntent(text: string) {
    setBusyLabel("Understanding…");
    setBusy(true);
    try {
      const res = await fetch("/api/intent/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("parse_failed");
      const j = (await res.json()) as { intent: Intent; provider: string };
      setIntent(j.intent);
      setProvider(j.provider);
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }

  function confirmAndRoute() {
    if (!intent) return;

    // C70 — voice now routes three intent actions:
    //   direct_send → /send (existing flow)
    //   save_for    → /wishes#save with the goal pre-filled
    //   schedule    → /wishes#schedule with cadence + amount + recipient
    //   unknown     → error toast (LLM didn't understand)
    if (intent.action === "unknown") {
      toast.error("Couldn't parse — try 'send alice 5' or 'save 50 for AWS'.");
      return;
    }

    if (intent.action === "save_for") {
      if (!intent.amount_usdc || !intent.goal_label) {
        toast.error("Missing amount or goal label.");
        return;
      }
      const params = new URLSearchParams();
      params.set("amount", intent.amount_usdc);
      params.set("label", intent.goal_label);
      router.push(`/wishes?tab=save&${params.toString()}`);
      return;
    }

    if (intent.action === "schedule") {
      const target =
        intent.recipient_handle ?? intent.recipient_pubkey ?? "";
      if (!target || !intent.amount_usdc || !intent.cadence) {
        toast.error("Missing recipient, amount, or cadence.");
        return;
      }
      const params = new URLSearchParams();
      params.set("to", target);
      params.set("amount", intent.amount_usdc);
      params.set("cadence", intent.cadence);
      if (intent.note) params.set("note", intent.note);
      router.push(`/wishes?tab=schedule&${params.toString()}`);
      return;
    }

    // direct_send fall-through
    const target =
      intent.recipient_handle ?? intent.recipient_pubkey ?? "";
    if (!target || !intent.amount_usdc) {
      toast.error("Missing recipient or amount.");
      return;
    }
    const params = new URLSearchParams();
    params.set("to", target);
    params.set("amount", intent.amount_usdc);
    if (intent.note) params.set("note", intent.note);
    router.push(`/send?${params.toString()}`);
  }

  return (
    <W6AppShell>
      <div style={{ maxWidth: 560 }}>
        <header style={{ marginBottom: 28 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Compose · voice
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            Speak the payment.
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
            Speak or type a payment intent. Settle parses it, then takes
            you to the regular send screen for final confirmation — your
            wallet still signs. No invisible auto-sends.
          </p>
        </header>

        {/* Voice */}
        <section className="rounded-2xl border border-foreground/10 bg-white/[0.02] p-6">
          <p className="text-[11px] uppercase tracking-wide text-foreground/40">Voice</p>
          <div className="mt-3 flex items-center gap-3">
            {!recording ? (
              <button
                onClick={startRecording}
                disabled={busy}
                className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-background disabled:opacity-50"
              >
                Hold the mic
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="rounded-full bg-red-500 px-5 py-2 text-xs font-medium text-background"
              >
                ⏺ Stop & transcribe
              </button>
            )}
            {busy && busyLabel && (
              <span className="text-xs text-foreground/50">{busyLabel}</span>
            )}
          </div>
          {transcript && (
            <p className="mt-4 text-xs text-foreground/70">
              <span className="text-foreground/40">Transcript:</span> {transcript}
            </p>
          )}
        </section>

        {/* Text fallback */}
        <section className="mt-4 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6">
          <p className="text-[11px] uppercase tracking-wide text-foreground/40">
            Or just type
          </p>
          <input
            value={textIntent}
            onChange={(e) => setTextIntent(e.target.value)}
            placeholder='e.g. "send alice 5 USDC for coffee"'
            className="mt-3 w-full rounded-lg border border-foreground/10 bg-transparent px-3 py-2 text-sm"
          />
          <button
            onClick={() => textIntent && parseIntent(textIntent)}
            disabled={busy || !textIntent}
            className="mt-3 rounded-full border border-foreground/20 px-4 py-2 text-xs disabled:opacity-50"
          >
            Parse →
          </button>
        </section>

        {/* Confirmation */}
        {intent && (
          <section className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] uppercase tracking-wide text-foreground/40">
                We heard
              </p>
              <span className="text-[11px] text-foreground/40">via {provider}</span>
            </div>
            {intent.action === "unknown" ? (
              <p className="mt-3 text-sm text-amber-400">
                Couldn't extract an intent. Try: "send alice 5 USDC for coffee"
              </p>
            ) : (
              <>
                <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <Field
                    label="Action"
                    value={intent.action}
                  />
                  <Field
                    label="Amount"
                    value={intent.amount_usdc ? `$${intent.amount_usdc} USDC` : "—"}
                  />
                  <Field
                    label="Recipient"
                    value={
                      intent.recipient_handle
                        ? `@${intent.recipient_handle}`
                        : intent.recipient_pubkey
                          ? `${intent.recipient_pubkey.slice(0, 6)}…${intent.recipient_pubkey.slice(-4)}`
                          : "(unresolved)"
                    }
                  />
                  <Field
                    label="Confidence"
                    value={`${(intent.confidence * 100).toFixed(0)}%`}
                  />
                  {intent.note && <Field label="Note" value={intent.note} />}
                </dl>
                <button
                  onClick={confirmAndRoute}
                  disabled={!intent.amount_usdc || (!intent.recipient_handle && !intent.recipient_pubkey)}
                  className="mt-5 rounded-full bg-accent px-5 py-2 text-xs font-medium text-background disabled:opacity-50"
                >
                  Continue to confirm →
                </button>
              </>
            )}
          </section>
        )}
      </div>
    </W6AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
      <p className="text-[10px] uppercase tracking-wide text-foreground/40">{label}</p>
      <p className="mt-1 text-foreground/80">{value}</p>
    </div>
  );
}
