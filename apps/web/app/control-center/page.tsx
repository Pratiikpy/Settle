import Link from "next/link";
import { W6AppShell } from "../../components/w6-app-shell";

const stats = [
  { label: "Apps", value: "4", detail: "web, indexer, demo-agent, demo-merchants" },
  { label: "Packages", value: "6", detail: "sdk, ui, types, mcp, python, rust" },
  { label: "Program", value: "1", detail: "settle-agent-card Anchor program" },
  { label: "Migrations", value: "45", detail: "Supabase schema history" },
];

const knowledgeFiles = [
  ["Start here", "/docs/project-knowledge/00_START_HERE.md"],
  ["Product map", "/docs/project-knowledge/01_PRODUCT_MAP.md"],
  ["System map", "/docs/project-knowledge/02_SYSTEM_MAP.md"],
  ["Feature matrix", "/docs/project-knowledge/03_FEATURE_MATRIX.md"],
  ["Integration graph", "/docs/project-knowledge/04_INTEGRATION_GRAPH.md"],
  ["User flows", "/docs/project-knowledge/05_USER_FLOWS.md"],
  ["API map", "/docs/project-knowledge/06_API_MAP.md"],
  ["Database map", "/docs/project-knowledge/07_DATABASE_MAP.md"],
  ["Solana program map", "/docs/project-knowledge/08_SOLANA_PROGRAM_MAP.md"],
  ["SDK / MCP / extension", "/docs/project-knowledge/09_SDK_MCP_EXTENSION_MAP.md"],
  ["Runbooks", "/docs/project-knowledge/10_RUNBOOKS.md"],
  ["Human actions", "/docs/project-knowledge/11_HUMAN_ACTIONS.md"],
  ["Audit findings", "/docs/project-knowledge/12_AUDIT_FINDINGS.md"],
  ["Decisions", "/docs/project-knowledge/13_DECISIONS_ADR.md"],
];

const systemAreas = [
  {
    name: "Web app",
    path: "apps/web",
    status: "active",
    note: "Next.js UI and API routes for all product surfaces.",
  },
  {
    name: "Indexer and workers",
    path: "apps/indexer",
    status: "active",
    note: "Program logs, webhooks, escrow cron, badges, compression, federation.",
  },
  {
    name: "Anchor program",
    path: "programs/settle-agent-card",
    status: "active",
    note: "AgentCard, Pact, streaming, escrow, receipt instructions.",
  },
  {
    name: "SDKs",
    path: "packages/sdk, python-sdk, rust-sdk",
    status: "active",
    note: "Canonical hashes, verification, parity, developer integration.",
  },
  {
    name: "MCP middleware",
    path: "packages/mcp-middleware",
    status: "active",
    note: "Payment middleware for agent/MCP surfaces.",
  },
  {
    name: "Chrome extension",
    path: "not found",
    status: "missing",
    note: "Do not claim shipped until an extension app/package exists.",
  },
];

const featureRows = [
  {
    feature: "Universal Receipt Kernel",
    status: "priority",
    trace: "Every payment kind -> receipt hashes -> verifier",
    risk: "Core wedge is only safe when every payment kind uses it.",
  },
  {
    feature: "AgentCard + Pact",
    status: "active",
    trace: "Cards UI -> API -> Anchor ixs -> indexer -> receipts",
    risk: "Runtime Anchor tests and devnet smoke must stay green.",
  },
  {
    feature: "Streaming + escrow",
    status: "active",
    trace: "UI/API -> streaming/escrow ixs -> DB mirror -> receipt state",
    risk: "Receipt coverage and mode-specific refund UX need repeated audit.",
  },
  {
    feature: "Merchant/creator handles",
    status: "active",
    trace: "/at, /m routes -> handle/merchant APIs -> receipts/feed",
    risk: "Public/private visibility must stay correct.",
  },
  {
    feature: "Developer surface",
    status: "active",
    trace: "Docs -> SDK/MCP/web components -> verifier/API",
    risk: "Examples must match actual exports.",
  },
];

const flows = [
  "Connect wallet -> dashboard -> send -> receipt -> verify",
  "Create card -> open pact -> agent spend -> receipt -> revoke/close",
  "Open streaming pact -> claim -> pause/resume -> receipt",
  "Open delivery escrow -> release/dispute -> stateful receipt",
  "Merchant profile -> QR/link/Blink -> buyer pays -> analytics/webhook",
  "SDK/MCP integration -> payment request -> verification",
];

const humanActions = [
  "Deploy/redeploy Anchor program on devnet after program changes.",
  "Run browser smoke with Phantom and real devnet USDC/SOL.",
  "Populate environment keys for Supabase, Helius, VAPID, sealed-box, badge, ZK, facilitator.",
  "Register Blinks/actions domain where required.",
  "Run localnet/devnet Anchor tests once Solana/SBF toolchain is available.",
  "Keep Chrome extension marked planned until files exist.",
];

const findings = [
  {
    id: "PK-001",
    severity: "HIGH",
    title: "Universal Receipt Kernel coverage must be proven across every payment kind.",
  },
  {
    id: "PK-002",
    severity: "LOW",
    title: "Chrome extension surface not present in current repository.",
  },
  {
    id: "PK-003",
    severity: "MEDIUM",
    title: "Runtime confidence still depends on local Solana/Anchor toolchain and browser smoke.",
  },
];

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    neutral: "border-[#e4e4e7] bg-[#f4f4f5] text-[#27272a]",
    good: "border-accent/30 bg-accent/10 text-accent",
    warn: "border-yellow-400/30 bg-yellow-400/10 text-yellow-300",
    danger: "border-red-400/30 bg-red-400/10 text-red-300",
  };
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

export default function ControlCenterPage() {
  return (
    <W6AppShell forceSurface="operator">
      <div>
        <header style={{ marginBottom: 32 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Operator console · internal
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            Health, federation, cron, preflight.
          </h1>
          <p
            className="w6-muted"
            style={{
              fontSize: 14,
              marginTop: 8,
              maxWidth: 720,
              lineHeight: 1.5,
            }}
          >
            Navigation layer for the full Settle codebase: product map,
            system map, feature traceability, integration graph, human
            actions, and open audit findings. Use this before large
            builds, audits, or handoffs.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {stats.map((item) => (
            <div key={item.label} className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
              <p className="text-3xl font-semibold">{item.value}</p>
              <p className="mt-1 text-sm font-medium">{item.label}</p>
              <p className="mt-2 text-xs leading-5 text-[#52525b]">{item.detail}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Operating Rule</h2>
              <p className="mt-1 text-sm text-[#52525b]">
                Big is allowed. Random is not.
              </p>
            </div>
            <Badge tone="good">Programmable / verifiable / trusted money</Badge>
          </div>
          <p className="mt-4 max-w-4xl text-sm leading-6 text-[#09090b]/65">
            Every feature must attach to the product spine: humans and agents move money
            through programmable rules, verifiable receipts, and trust-building reputation
            on Solana. If a feature cannot be traced to that spine, it belongs outside Settle.
          </p>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-6">
            <h2 className="text-xl font-semibold">System Areas</h2>
            <div className="mt-5 space-y-3">
              {systemAreas.map((area) => (
                <div key={area.name} className="rounded-xl border border-[#e4e4e7] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{area.name}</p>
                      <p className="mt-1 font-mono text-xs text-[#71717a]">{area.path}</p>
                    </div>
                    <Badge tone={area.status === "missing" ? "danger" : "good"}>{area.status}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-5 text-[#52525b]">{area.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-6">
            <h2 className="text-xl font-semibold">Knowledge Files</h2>
            <p className="mt-1 text-sm text-[#52525b]">
              Markdown truth lives in Git. This page is the visual index.
            </p>
            <div className="mt-5 grid gap-2">
              {knowledgeFiles.map(([label, path]) => (
                <div
                  key={path}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#e4e4e7] px-3 py-2"
                >
                  <span className="text-sm">{label}</span>
                  <span className="truncate font-mono text-[11px] text-[#71717a]">{path}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-6">
          <h2 className="text-xl font-semibold">Feature Traceability Snapshot</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[#71717a]">
                <tr>
                  <th className="border-b border-[#e4e4e7] pb-3">Feature</th>
                  <th className="border-b border-[#e4e4e7] pb-3">Status</th>
                  <th className="border-b border-[#e4e4e7] pb-3">Trace</th>
                  <th className="border-b border-[#e4e4e7] pb-3">Risk</th>
                </tr>
              </thead>
              <tbody>
                {featureRows.map((row) => (
                  <tr key={row.feature} className="border-b border-[#f4f4f5]">
                    <td className="py-4 font-medium">{row.feature}</td>
                    <td className="py-4">
                      <Badge tone={row.status === "priority" ? "warn" : "good"}>{row.status}</Badge>
                    </td>
                    <td className="py-4 text-[#52525b]">{row.trace}</td>
                    <td className="py-4 text-[#52525b]">{row.risk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-6">
            <h2 className="text-lg font-semibold">Core Flows</h2>
            <ul className="mt-4 space-y-3 text-sm text-[#09090b]/65">
              {flows.map((flow) => (
                <li key={flow} className="rounded-lg border border-[#e4e4e7] p-3">
                  {flow}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-6">
            <h2 className="text-lg font-semibold">Human Actions</h2>
            <ul className="mt-4 space-y-3 text-sm text-[#09090b]/65">
              {humanActions.map((action) => (
                <li key={action} className="rounded-lg border border-[#e4e4e7] p-3">
                  {action}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-6">
            <h2 className="text-lg font-semibold">Open Findings</h2>
            <div className="mt-4 space-y-3">
              {findings.map((finding) => (
                <div key={finding.id} className="rounded-lg border border-[#e4e4e7] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-[#71717a]">{finding.id}</span>
                    <Badge tone={finding.severity === "HIGH" ? "danger" : finding.severity === "MEDIUM" ? "warn" : "neutral"}>
                      {finding.severity}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-[#09090b]/65">{finding.title}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-6">
          <h2 className="text-xl font-semibold">Next Audit Loop</h2>
          <ol className="mt-4 grid gap-3 text-sm text-[#09090b]/65 md:grid-cols-4">
            <li className="rounded-xl border border-[#e4e4e7] p-4">1. Update system map when files move.</li>
            <li className="rounded-xl border border-[#e4e4e7] p-4">2. Update feature matrix when a feature ships.</li>
            <li className="rounded-xl border border-[#e4e4e7] p-4">3. Add findings before fixes.</li>
            <li className="rounded-xl border border-[#e4e4e7] p-4">4. Close findings only with verification evidence.</li>
          </ol>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/audit" className="rounded-full border border-[#e4e4e7] px-4 py-2 text-sm hover:bg-[#f4f4f5]">
              Open audit page
            </Link>
            <Link href="/docs" className="rounded-full border border-[#e4e4e7] px-4 py-2 text-sm hover:bg-[#f4f4f5]">
              Developer docs
            </Link>
            <Link href="/dashboard" className="rounded-full border border-[#e4e4e7] px-4 py-2 text-sm hover:bg-[#f4f4f5]">
              Dashboard
            </Link>
          </div>
        </section>
      </div>
    </W6AppShell>
  );
}
