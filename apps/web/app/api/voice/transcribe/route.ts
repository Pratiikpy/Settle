import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F7.12 — Voice → text.
 *
 *   POST /api/voice/transcribe
 *     Content-Type: multipart/form-data
 *     fields:
 *       audio: Blob (webm/ogg/mp3/wav, < 10 MB)
 *       language?: ISO-639-1 (default "en")
 *
 *   Response:
 *     { ok: true, text: string, language: string, provider: "nim" }
 *
 * The endpoint is intentionally MINIMAL — it does ONE thing (audio →
 * text). The natural-language intent parsing happens at /api/intent/parse,
 * which clients call as a follow-up. Splitting them this way means:
 *   1. Either step can be tested in isolation.
 *   2. Clients with their own STT (e.g. browser Web Speech API) can
 *      skip transcribe entirely and post text directly.
 *   3. The transcription provider can be swapped without touching
 *      intent parsing.
 *
 * The 10 MB cap is enforced server-side; ~10 minutes of compressed
 * audio at typical voice-note bitrates. Anything longer than a sentence
 * is probably a misuse — voice intents should be short.
 */

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const ACCEPTED_MIME = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp3",
  "audio/mpeg",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mp4",
  "audio/m4a",
]);

export async function POST(req: NextRequest) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "transcription_unconfigured", message: "NVIDIA_API_KEY not set." },
      { status: 503 },
    );
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "expected_multipart", message: "send Content-Type: multipart/form-data" },
      { status: 415 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form_data" }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "audio_field_required" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "audio_too_large", max_bytes: MAX_AUDIO_BYTES },
      { status: 413 },
    );
  }
  if (audio.type && !ACCEPTED_MIME.has(audio.type)) {
    return NextResponse.json(
      { error: "unsupported_audio_type", got: audio.type, accepted: [...ACCEPTED_MIME] },
      { status: 415 },
    );
  }

  const language = (form.get("language") as string | null) ?? "en";

  // Forward to NVIDIA NIM ASR. We use OpenAI-compatible audio/transcriptions
  // shape — the NIM endpoint mirrors that contract for Whisper-class models.
  const upstreamForm = new FormData();
  upstreamForm.append("file", audio, "audio");
  upstreamForm.append(
    "model",
    process.env.NVIDIA_NIM_ASR_MODEL ?? "nvidia/parakeet-tdt-0.6b-v2",
  );
  upstreamForm.append("language", language);
  upstreamForm.append("response_format", "json");

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(
      "https://integrate.api.nvidia.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: upstreamForm,
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: "asr_transport_error",
        message: e instanceof Error ? e.message : "unknown",
      },
      { status: 502 },
    );
  }

  if (!upstreamRes.ok) {
    const detail = await upstreamRes.text().catch(() => "");
    return NextResponse.json(
      { error: "asr_upstream_failed", status: upstreamRes.status, detail: detail.slice(0, 400) },
      { status: 502 },
    );
  }

  const j = (await upstreamRes.json()) as { text?: string; language?: string };
  const text = (j.text ?? "").trim();
  if (text.length === 0) {
    return NextResponse.json(
      { error: "empty_transcription", hint: "Audio may be silent or too short." },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    text,
    language: j.language ?? language,
    provider: "nim" as const,
  });
}
