/**
 * Canonical NVIDIA NIM client for all LLM-needed features.
 *
 * Wave 0 of EXECUTE_PLAN — replaces ad-hoc `fetch("https://integrate.api.nvidia.com/v1/chat/completions")`
 * scattered across routes (disputes/draft, narrate, intent/parse,
 * bookkeeper/categorize, voice/transcribe) with one helper that
 * standardizes auth, error handling, and model selection.
 *
 * Why NIM:
 *   - Free tier — no Anthropic/OpenAI bills.
 *   - OpenAI-compatible chat-completions endpoint.
 *   - Multiple models hostable (minimax, glm, llama, mixtral).
 *
 * Use this for:
 *   - Receipt narration (forensic-timeline plain English).
 *   - Dispute drafts (merchant-side response).
 *   - NL capability discovery (rank + reason).
 *   - Command-palette intent parsing.
 *   - Bookkeeper auto-categorization.
 *   - Voice intent parsing.
 *
 * Do NOT use for:
 *   - Server-side embedding generation (use a dedicated embedding model).
 *   - Anything safety-critical that needs deterministic output.
 */

// Default = llama-3.3-70b (verified <4s on Wave 0 smoke test).
// minimax-m2.5 was slow under load; llama is a safer default.
// Override via NVIDIA_NIM_MODEL env var per-feature if needed.
export const NIM_DEFAULT_MODEL =
  process.env.NVIDIA_NIM_MODEL ?? "meta/llama-3.3-70b-instruct";

export interface NimChatRequest {
  /** Optional override; defaults to NIM_DEFAULT_MODEL. */
  model?: string;
  /** Sampling temperature. 0 = deterministic, 1+ = creative. Default 0.4. */
  temperature?: number;
  /** Top-p sampling. Default 1. */
  top_p?: number;
  /** Max output tokens. Default 360. */
  max_tokens?: number;
  /** Chat history. */
  messages: Array<
    | { role: "system" | "user" | "assistant"; content: string }
  >;
  /** Hard request timeout in ms. Default 25_000. */
  timeoutMs?: number;
  /** Stream response (returns ReadableStream-of-chunks). Default false. */
  stream?: boolean;
}

export interface NimChatResponse {
  text: string;
  raw: unknown;
  usage?:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined;
}

/**
 * Returns true if NVIDIA_NIM_API_KEY is set in env. Routes that have a
 * non-LLM fallback (template-rendered text, etc.) should branch on this
 * to avoid throwing in dev when the key is unset.
 */
export function nimAvailable(): boolean {
  return Boolean(process.env.NVIDIA_NIM_API_KEY);
}

/**
 * One-shot chat completion. Throws on missing env or non-200.
 *
 * Example:
 *   const reply = await nimChat({
 *     messages: [
 *       { role: "system", content: "You are a polite merchant assistant." },
 *       { role: "user", content: "Draft a reply for this dispute…" },
 *     ],
 *     temperature: 0.4,
 *     max_tokens: 360,
 *   });
 *   console.log(reply.text);
 */
export async function nimChat(req: NimChatRequest): Promise<NimChatResponse> {
  const apiKey = process.env.NVIDIA_NIM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "NVIDIA_NIM_API_KEY is not set. " +
        "Set it in .env.local + apps/web/.env.local before calling nimChat. " +
        "Use nimAvailable() in callers that have a non-LLM fallback path.",
    );
  }

  const body = {
    model: req.model ?? NIM_DEFAULT_MODEL,
    temperature: req.temperature ?? 0.4,
    top_p: req.top_p ?? 1,
    max_tokens: req.max_tokens ?? 360,
    messages: req.messages,
    stream: req.stream ?? false,
  };

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 25_000);
  let res: Response;
  try {
    res = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `NIM ${res.status} ${res.statusText}${txt ? ` — ${txt.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: NimChatResponse["usage"];
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return {
    text,
    raw: data,
    usage: data.usage,
  };
}
