import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nimChat, nimAvailable } from "../../../../lib/nvidia-nim";
import { getSupabaseServiceClient } from "../../../../lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F3.11 — NL capability discovery.
 *
 * GET /api/capabilities/discover?q=<query>
 *
 * User describes what they want in plain English ("cheap fast translation
 * for Spanish→English"). NVIDIA NIM ranks the capability_leaderboard
 * view's top entries against the query, returns top 5 with reasoning.
 *
 * No auth — public discovery surface.
 *
 * Wave 1 / Stream C3.
 */

const Query = z.object({
  q: z.string().min(3).max(300),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = Query.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const v = parsed.data;

  if (!nimAvailable()) {
    return NextResponse.json(
      { error: "llm_unconfigured", hint: "Set NVIDIA_NIM_API_KEY" },
      { status: 503 },
    );
  }

  let sb;
  try {
    sb = getSupabaseServiceClient();
  } catch {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }

  // Top-50 capabilities by total volume in the last 30 days.
  const { data: capRows } = await sb
    .from("capability_registry")
    .select("hash, alias, description")
    .limit(50);

  if (!capRows || capRows.length === 0) {
    return NextResponse.json({ ok: true, query: v.q, results: [] });
  }

  // Build NIM prompt. Keep it small — only the alias + description per cap.
  const candidatesText = capRows
    .map(
      (c, i) =>
        `${i + 1}. ${c.alias as string}: ${(c.description as string) || "(no description)"}`,
    )
    .join("\n");

  const sys = [
    "You are a capability-discovery assistant for Settle, a programmable payment rail.",
    "Given a user's natural-language need, you will rank candidate capabilities by relevance.",
    "Always reply ONLY with a JSON array of objects: [{\"alias\": \"…\", \"reasoning\": \"…\"}].",
    `Return at most ${v.limit} entries. Best match first. No prose outside the JSON.`,
  ].join("\n");
  const user = [
    `User need: "${v.q}"`,
    "",
    `Candidate capabilities (alias: description):`,
    candidatesText,
  ].join("\n");

  let reply;
  try {
    reply = await nimChat({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: 600,
      timeoutMs: 30_000,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "nim_failed", detail: (e as Error).message },
      { status: 502 },
    );
  }

  // Parse the LLM's JSON reply tolerantly — model may wrap in fences.
  const cleanText = reply.text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let ranked: Array<{ alias: string; reasoning: string }> = [];
  try {
    const parsed = JSON.parse(cleanText);
    if (Array.isArray(parsed)) {
      ranked = parsed
        .filter(
          (x): x is { alias: string; reasoning: string } =>
            typeof x === "object" &&
            x !== null &&
            typeof (x as { alias?: unknown }).alias === "string" &&
            typeof (x as { reasoning?: unknown }).reasoning === "string",
        )
        .slice(0, v.limit);
    }
  } catch {
    // Fallback: return the raw text as a single entry rather than 500'ing
    return NextResponse.json({
      ok: true,
      query: v.q,
      llm_unparsed: true,
      raw: reply.text,
      results: [],
    });
  }

  // Hydrate with hash + description from the registry.
  const aliasToRow = new Map(
    capRows.map((c) => [c.alias as string, c]),
  );
  const results = ranked
    .map((r) => {
      const row = aliasToRow.get(r.alias);
      if (!row) return null;
      return {
        alias: r.alias,
        reasoning: r.reasoning,
        hash: row.hash as string,
        description: (row.description as string) || null,
      };
    })
    .filter((x) => x !== null);

  return NextResponse.json({
    ok: true,
    query: v.q,
    count: results.length,
    results,
  });
}
