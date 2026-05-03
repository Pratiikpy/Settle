import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import { W6AppShell } from "../../../components/w6-app-shell";

export const metadata: Metadata = {
  title: "<settle-verify> — embeddable receipt verification",
  description:
    "Drop one script tag and one custom element into any HTML page to verify a Settle receipt — no framework, no API key, no auth.",
};

/**
 * F5.5 docs / demo page.
 *
 * Loads the public verify.js bundle via next/script (afterInteractive
 * strategy) so the custom element is registered before we render
 * `<settle-verify>` tags.
 *
 * Server-rendered. The custom element is invisible to React's diffing —
 * we drop it into raw JSX as a child node and let the browser's
 * customElements registry hydrate it.
 */
export default function VerifyComponentDocs() {
  return (
    <W6AppShell forceSurface="developer">
      <Script src="/verify.js" strategy="afterInteractive" />
      <div style={{ maxWidth: 880 }}>
        <div className="w6-eyebrow" style={{ fontSize: 12 }}>
          Embed component
        </div>
        <h1
          className="w6-heading"
          style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
        >
          &lt;settle-verify&gt;
        </h1>
        <p className="mt-2 text-sm text-[#52525b] max-w-xl">
          Embeddable receipt-verification widget. Paste two lines into any
          HTML page; show a Settle receipt's verification with no signup,
          no API key, no React build step.
        </p>

        {/* Install */}
        <Section title="Install">
          <pre className="block rounded-xl bg-black/30 p-4 text-xs text-[#27272a] overflow-x-auto">
            <code>{`<script src="https://settle.so/verify.js"></script>
<settle-verify hash="<32-byte-hex>"></settle-verify>`}</code>
          </pre>
          <p className="mt-3 text-sm text-[#52525b]">
            That&apos;s it. The custom element fetches{" "}
            <code className="text-xs">/api/verify/&lt;hash&gt;</code>, renders
            a Settle-styled card, and isolates its CSS via shadow DOM so it
            never fights your host page&apos;s styles.
          </p>
        </Section>

        {/* Live demo */}
        <Section title="Live demo">
          <p>
            This is a real <code>&lt;settle-verify&gt;</code> element rendered
            below — the script tag is on this page. Try inspecting it: the
            shadow root is open, click around to see the structure.
          </p>

          <div className="mt-4 grid gap-4">
            {/* By receipt-id (pulls from /api/receipts/[id]) */}
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-[#52525b]">
                By receipt-id
              </p>
              <settle-verify receipt-id="11111111-2222-3333-4444-555555555555" />
            </div>

            {/* Compact variant */}
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-[#52525b]">
                Compact variant
              </p>
              <settle-verify
                receipt-id="11111111-2222-3333-4444-555555555555"
                variant="compact"
              />
            </div>
          </div>
        </Section>

        {/* Attributes */}
        <Section title="Attributes">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#e4e4e7] text-left text-xs uppercase tracking-wide text-[#52525b]">
                <th className="py-2">attr</th>
                <th>type</th>
                <th>description</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              <tr className="border-b border-[#f4f4f5]">
                <td className="py-2 font-mono text-[#27272a]">hash</td>
                <td>32-byte hex</td>
                <td>Looks up by any of the 5 commit-chain hashes.</td>
              </tr>
              <tr className="border-b border-[#f4f4f5]">
                <td className="py-2 font-mono text-[#27272a]">receipt-id</td>
                <td>UUID v4</td>
                <td>Looks up by the receipt&apos;s primary key.</td>
              </tr>
              <tr className="border-b border-[#f4f4f5]">
                <td className="py-2 font-mono text-[#27272a]">endpoint</td>
                <td>URL</td>
                <td>
                  Override the API host. Default = same origin (so the script
                  served from settle.so calls settle.so&apos;s API).
                </td>
              </tr>
              <tr>
                <td className="py-2 font-mono text-[#27272a]">variant</td>
                <td>"compact"</td>
                <td>Single-line summary. Default = full card.</td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* Why */}
        <Section title="Why a web component instead of an npm package">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <b>Zero install on the host.</b> A merchant&apos;s e-commerce
              site can paste two tags and ship. No npm, no build pipeline.
            </li>
            <li>
              <b>~4 KB gzipped.</b> A React-based widget would be ~50 KB
              minimum and add a React runtime to the host page. The vanilla
              custom element loads in one tick.
            </li>
            <li>
              <b>Style isolation.</b> Shadow DOM means our CSS never collides
              with the host&apos;s CSS, and theirs never breaks our layout.
            </li>
            <li>
              <b>Public-good shape.</b> The same widget works for any
              published receipt — including receipts the host didn&apos;t
              create. That&apos;s the whole point: verifiable money is
              verifiable by anyone, not just the issuer.
            </li>
          </ul>
        </Section>

        <div className="mt-12 flex gap-3">
          <Link
            href="/docs"
            className="inline-flex h-10 items-center rounded-full border border-[#a1a1aa] px-5 text-xs hover:bg-[#f4f4f5]"
          >
            ← Back to docs
          </Link>
          <a
            href="/verify.js"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center rounded-full border border-[#a1a1aa] px-5 text-xs hover:bg-[#f4f4f5]"
          >
            View source: /verify.js ↗
          </a>
        </div>
      </div>
    </W6AppShell>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-medium tracking-tight">{props.title}</h2>
      <div className="prose prose-invert mt-4 max-w-none text-sm text-[#09090b]/75 leading-relaxed">
        {props.children}
      </div>
    </section>
  );
}
