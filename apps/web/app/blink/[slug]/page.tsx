/**
 * /blink/[slug] — Public Blink share page.
 * Shows preview of the agent template + "Hire this agent" CTA.
 * Phantom Blink rendering on Twitter is opt-in; this page is the fallback HTML view.
 *
 * Wires Day 4: fetch agent template by slug from Supabase + render Action GET endpoint at
 * /api/actions/hire/[slug] that returns ActionGetResponse for Blink rendering.
 */

interface BlinkParams {
  params: Promise<{ slug: string }>;
}

export default async function BlinkPage({ params }: BlinkParams) {
  const { slug } = await params;

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <div className="rounded-2xl border border-foreground/10 p-6">
        <div className="text-xs text-accent">Solana Blink · @pratiik shared this</div>
        <h1 className="mt-2 text-2xl font-medium">Hire this AI agent</h1>
        <p className="mt-2 text-sm text-foreground/60">
          {slug === "research"
            ? "Research any topic, $0.50–$2 max. Returns a 3-page brief in 5 min."
            : "Custom agent template."}
        </p>

        <div className="mt-6 rounded-xl bg-foreground/5 p-4 text-sm">
          <div className="text-xs text-foreground/50">Cap</div>
          <div className="mt-1 font-mono">$0.50 USDC</div>
          <div className="mt-3 text-xs text-foreground/50">Allowlist</div>
          <div className="mt-1 text-xs text-foreground/70">
            ArxivFetch · TranslateAPI · SummaryLLM
          </div>
          <div className="mt-3 text-xs text-foreground/50">Expiry</div>
          <div className="mt-1 text-xs text-foreground/70">15 min</div>
        </div>

        <button className="mt-6 w-full rounded-full bg-accent py-3 text-sm font-medium text-background">
          Hire — connect Phantom
        </button>

        <p className="mt-4 text-center text-xs text-foreground/40">
          You sign a Pact card. Watch the agent work. Get a deliverable + cNFT receipt.
        </p>
      </div>

      <div className="mt-8 text-center text-xs text-foreground/40">
        Powered by Solana Actions · Phantom-renderable on Twitter
      </div>
    </main>
  );
}
