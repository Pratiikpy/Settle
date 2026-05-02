import Link from "next/link";
import { W6AppShell } from "../../../components/w6-app-shell";
import { TemplateBrowser } from "./template-browser";

export const dynamic = "force-dynamic";

interface Template {
  slug: string;
  title: string;
  description: string;
  author_pubkey: string;
  cap_usdc: number;
  expiry_minutes: number;
  merchant_allowlist: string[];
  default_purpose: string;
  icon_emoji: string;
  use_count: number;
  featured: boolean;
  created_at: string;
}

async function fetchTemplates(): Promise<Template[]> {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/templates`, { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as { templates: Template[] };
    return json.templates ?? [];
  } catch {
    return [];
  }
}

export default async function TemplatesPage() {
  const templates = await fetchTemplates();
  return (
    <W6AppShell forceSurface="agent">
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 24,
            marginBottom: 28,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="w6-eyebrow" style={{ fontSize: 12 }}>
              Templates
            </div>
            <h1
              className="w6-heading"
              style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
            >
              Pre-built agent configurations.
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
              Pick one to spawn a card with sensible defaults. Tweak before
              signing. Each template is open-source and publishable by
              anyone — receipts are still signed by the user.
            </p>
          </div>
          <Link
            href="/agents/templates/new"
            className="w6-btn w6-btn-secondary w6-btn-sm"
          >
            + Publish a template
          </Link>
        </div>

        <TemplateBrowser initial={templates} />
      </div>
    </W6AppShell>
  );
}
