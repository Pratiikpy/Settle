import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://settle.so";
  const now = new Date();

  const staticRoutes = [
    "",
    "/send",
    "/send/link",
    "/agents",
    "/agents/templates",
    "/feed",
    "/activity",
    "/help",
    "/docs",
    "/security",
    "/public-goods",
    // Marketing surfaces added in the magic-moment / onboarding work
    "/watch",
    "/start",
    "/start/consumer",
    "/start/merchant",
    "/start/agent",
    "/leaderboard",
    "/verify",
  ];

  const entries: MetadataRoute.Sitemap = staticRoutes.map((p) => ({
    url: `${base}${p || "/"}`,
    lastModified: now,
    changeFrequency: p === "" ? "daily" : "weekly",
    priority: p === "" ? 1 : 0.6,
  }));

  // Best-effort: include featured templates if Supabase is reachable.
  try {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(url, key, { auth: { persistSession: false } });
      const { data } = await sb
        .from("agent_templates")
        .select("slug, updated_at")
        .order("updated_at", { ascending: false })
        .limit(200);
      for (const t of data ?? []) {
        entries.push({
          url: `${base}/agents/templates/${t.slug}`,
          lastModified: t.updated_at ? new Date(t.updated_at) : now,
          changeFrequency: "monthly",
          priority: 0.4,
        });
      }
    }
  } catch {
    // skip
  }

  return entries;
}
