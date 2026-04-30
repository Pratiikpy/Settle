import { notFound } from "next/navigation";
import Link from "next/link";
import { Footer } from "../../../../components/footer";
import { TemplateHireButton } from "./hire-button";

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

async function fetchTemplate(slug: string): Promise<Template | null> {
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/templates/${slug}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { template?: Template };
    return json.template ?? null;
  } catch {
    return null;
  }
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await fetchTemplate(slug);
  if (!t) notFound();

  return (
    <>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/agents/templates"
          className="text-xs text-foreground/50 hover:text-foreground"
        >
          ← Marketplace
        </Link>
        <div className="mt-6 flex items-start gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-sm font-semibold text-accent">
            {t.icon_emoji}
          </span>
          <div className="flex-1">
            <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
            <div className="mt-1 text-xs text-foreground/45">
              by{" "}
              <code className="text-foreground/60">
                {t.author_pubkey.slice(0, 6)}…{t.author_pubkey.slice(-4)}
              </code>
              {" · "}
              {t.use_count} hires
              {t.featured && " · ★ Featured"}
            </div>
          </div>
        </div>

        <p className="mt-6 text-sm text-foreground/75">{t.description}</p>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Cap" value={`$${Number(t.cap_usdc).toFixed(2)}`} />
          <Stat label="Expiry" value={`${t.expiry_minutes}m`} />
          <Stat
            label="Merchants"
            value={t.merchant_allowlist.length === 0 ? "open" : String(t.merchant_allowlist.length)}
          />
          <Stat label="Slug" value={t.slug} mono />
        </div>

        {t.merchant_allowlist.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-medium text-foreground/80">Allowlisted merchants</h2>
            <div className="mt-3 grid gap-2">
              {t.merchant_allowlist.map((m) => (
                <code
                  key={m}
                  className="block rounded-lg border border-foreground/10 bg-white/[0.02] px-3 py-2 text-xs text-foreground/70"
                >
                  {m}
                </code>
              ))}
            </div>
          </section>
        )}

        {t.default_purpose && (
          <section className="mt-8">
            <h2 className="text-sm font-medium text-foreground/80">Default purpose</h2>
            <p className="mt-2 text-sm text-foreground/65">{t.default_purpose}</p>
          </section>
        )}

        <div className="mt-10">
          <TemplateHireButton slug={t.slug} />
        </div>

        <p className="mt-3 text-xs text-foreground/45">
          Hiring builds an <code>open_pact</code> instruction signed by your wallet. Hard caps
          are enforced on-chain.
        </p>
      </main>
      <Footer />
    </>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-foreground/10 bg-white/[0.02] p-4">
      <div className="text-[10px] uppercase tracking-wider text-foreground/45">{label}</div>
      <div className={mono ? "mt-1 font-mono text-sm" : "mt-1 text-sm font-medium"}>{value}</div>
    </div>
  );
}
