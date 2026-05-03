import { PersonaPage } from "../../../components/persona-page";

export const dynamic = "force-static";
export const metadata = {
  title: "Build with AI agents · Settle",
};

export default function AgentOnboarding() {
  return (
    <PersonaPage
      testId="onboard-agent"
      title="Build with AI agents."
      subtitle="Three steps to a budget your agent can actually spend."
      steps={[
        {
          n: 1,
          title: "Create an agent budget",
          body: "Set a daily cap, max-per-tx, allowed merchants. Settle enforces every rule on-chain.",
          ctaText: "Create budget",
          ctaHref: "/cards/new",
        },
        {
          n: 2,
          title: "Plug in via SDK or MCP",
          body: "TypeScript, Python, Rust, or MCP middleware — pick your runtime. 5-line snippets get you spending.",
          ctaText: "View SDK docs",
          ctaHref: "/docs",
        },
        {
          n: 3,
          title: "Watch the receipts roll in",
          body: "Every spend (allowed or blocked) writes a 4-hash chain. Live dashboard. Instant revoke.",
          ctaText: "Watch demo",
          ctaHref: "/watch",
        },
      ]}
      whatNext={[
        { label: "Streaming pacts", href: "/cards/streaming" },
        { label: "Hire a template agent", href: "/agents/templates" },
        { label: "MCP middleware docs", href: "/docs/mcp" },
      ]}
    />
  );
}
