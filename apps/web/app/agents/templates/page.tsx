import Link from "next/link";
import { Footer } from "../../../components/footer";
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
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
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
    <>
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Agent template marketplace</h1>
            <p className="mt-2 text-sm text-foreground/60">
              Open-source agent recipes. Each one spawns a Pact card with hard caps. Anyone can
              publish — receipts are still signed by the user.
            </p>
          </div>
          <Link
            href="/agents/templates/new"
            className="hidden rounded-full border border-foreground/20 px-4 py-2 text-xs hover:bg-foreground/5 sm:inline-flex"
          >
            Publish a template
          </Link>
        </div>

        <TemplateBrowser initial={templates} />
      </main>
      <Footer />
    </>
  );
}
