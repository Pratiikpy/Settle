"use client";

/**
 * Voice-note recorder + sealed-box encryptor (F5).
 *
 * Browser-only. Captures audio via MediaRecorder, encrypts to the per-deployment
 * SETTLE_SEALED_BOX_PUBKEY (same trust model as receipt purpose text), uploads ciphertext
 * to /api/receipts/[id]/attachments. The server-side endpoint signs the upload URL and
 * inserts the metadata row.
 *
 * Browser support: MediaRecorder is in all modern browsers; we prefer audio/webm with the
 * opus codec (smallest, widely supported). Fallback: audio/mp4 on Safari.
 *
 * Cap: 10 seconds, ~80KB raw → ~96KB sealed (32-byte ephemeral pubkey + 16-byte poly1305
 * tag overhead). Server enforces 512KB hard cap on the bucket.
 */

import { sealedBoxEncryptToPubkey } from "@settle/sdk";

const MAX_DURATION_MS = 10_000;
const MAX_BYTES = 256 * 1024; // 256KB raw audio, well under bucket's 512KB ciphertext cap

export interface VoiceNoteCapture {
  /** Sealed-box ciphertext: [eph_pub 32][cipher+mac]. */
  ciphertext: Uint8Array;
  duration_ms: number;
  mime_type: string;
  raw_bytes: number;
}

export type RecorderState =
  | { status: "idle" }
  | { status: "recording"; startedAt: number }
  | { status: "stopping" }
  | { status: "ready"; blob: Blob; mimeType: string; durationMs: number }
  | { status: "error"; reason: string };

export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private mimeType = "audio/webm;codecs=opus";

  async start(): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return { ok: false, reason: "browser does not support audio recording" };
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Pick the best mime type the browser supports.
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4;codecs=mp4a.40.2",
        "audio/mp4",
      ];
      const supported =
        candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "audio/webm";
      this.mimeType = supported;
      this.chunks = [];
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: supported });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };
      this.mediaRecorder.start();
      this.startedAt = performance.now();
      // Auto-stop at 10s
      window.setTimeout(() => {
        if (this.mediaRecorder?.state === "recording") this.mediaRecorder.stop();
      }, MAX_DURATION_MS);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: (e as Error).message };
    }
  }

  /** Stops recording and resolves with the assembled blob + duration. */
  stop(): Promise<{ blob: Blob; mimeType: string; durationMs: number } | null> {
    return new Promise((resolve) => {
      const recorder = this.mediaRecorder;
      if (!recorder) {
        resolve(null);
        return;
      }
      const onStop = () => {
        recorder.removeEventListener("stop", onStop);
        const blob = new Blob(this.chunks, { type: this.mimeType });
        const durationMs = Math.round(performance.now() - this.startedAt);
        // Stop the underlying tracks so the mic indicator goes off.
        try {
          recorder.stream.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
        this.mediaRecorder = null;
        resolve({ blob, mimeType: this.mimeType, durationMs });
      };
      recorder.addEventListener("stop", onStop);
      if (recorder.state === "recording") recorder.stop();
    });
  }

  cancel() {
    try {
      this.mediaRecorder?.stream.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    this.mediaRecorder = null;
    this.chunks = [];
  }
}

/**
 * Encrypt a recorded blob to the deployment's sealed-box pubkey. Browser-side; the privkey
 * never leaves the server. The server decrypts on the /play endpoint after wallet-sig auth.
 */
export async function encryptVoiceNote(input: {
  blob: Blob;
  durationMs: number;
  mimeType: string;
  sealedBoxPubkeyB64: string;
}): Promise<VoiceNoteCapture> {
  const arrayBuf = await input.blob.arrayBuffer();
  const raw = new Uint8Array(arrayBuf);
  if (raw.byteLength > MAX_BYTES) {
    throw new Error(`recording too large: ${raw.byteLength} bytes (max ${MAX_BYTES})`);
  }

  const recipientPub = base64ToBytes(input.sealedBoxPubkeyB64);
  if (recipientPub.length !== 32) {
    throw new Error(`SETTLE_SEALED_BOX_PUBKEY must decode to 32 bytes, got ${recipientPub.length}`);
  }

  const ciphertext = sealedBoxEncryptToPubkey(raw, recipientPub);
  return {
    ciphertext,
    duration_ms: input.durationMs,
    mime_type: input.mimeType,
    raw_bytes: raw.byteLength,
  };
}

function base64ToBytes(s: string): Uint8Array {
  // Tolerate base64url too
  const padded = s.replaceAll("-", "+").replaceAll("_", "/");
  const padding = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  return Uint8Array.from(atob(padding), (c) => c.charCodeAt(0));
}
