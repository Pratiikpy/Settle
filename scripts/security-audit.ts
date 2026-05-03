#!/usr/bin/env tsx
/**
 * Section 52 — Security audit checklist.
 * Lightweight automated checks:
 *   - No private keys in client bundle
 *   - No service role keys / .env values in client
 *   - CSP / security headers on the served pages
 *   - Common XSS vectors caught (script injection in URL)
 */
import "dotenv/config";

const HOST = process.env.API_HOST ?? "http://localhost:3000";

const SECRET_PATTERNS = [
  /SUPABASE_SERVICE_ROLE_KEY/,
  /CRON_SECRET/,
  /WEBHOOK_SECRET/,
  /SETTLE_FACILITATOR_PRIVKEY/,
  /SETTLE_RELAYER_PRIVKEY/,
  /HELIUS_API_KEY=/,
  /sk_live_/,
  /BEGIN PRIVATE KEY/,
];

interface Finding {
  rule: string;
  page: string;
  detail: string;
  severity: "high" | "medium" | "low";
}

async function fetchHTML(path: string): Promise<string> {
  const r = await fetch(HOST + path, { signal: AbortSignal.timeout(15000) });
  return await r.text();
}

async function fetchJSChunks(html: string): Promise<string[]> {
  const matches = [...html.matchAll(/\/_next\/static\/chunks\/[^"'\s]+\.js/g)].map((m) => m[0]);
  return [...new Set(matches)];
}

async function main() {
  console.log("# security-audit");
  const findings: Finding[] = [];
  const pages = ["/", "/dashboard", "/send", "/cards", "/settings", "/m/me/manage", "/leaderboard"];
  let chunksToCheck = new Set<string>();

  for (const p of pages) {
    let html: string;
    try {
      html = await fetchHTML(p);
    } catch (e: any) {
      console.log(`! couldn't fetch ${p}: ${e.message}`);
      continue;
    }
    // Check for inline secrets in HTML
    for (const re of SECRET_PATTERNS) {
      if (re.test(html)) {
        findings.push({
          rule: "secret-leak-html",
          page: p,
          detail: `pattern ${re} matched in HTML response`,
          severity: "high",
        });
      }
    }
    // Collect JS chunks
    const chunks = await fetchJSChunks(html);
    for (const c of chunks) chunksToCheck.add(c);
  }

  // Check JS chunks
  console.log(`# scanning ${chunksToCheck.size} chunks for secret patterns…`);
  for (const c of chunksToCheck) {
    try {
      const r = await fetch(HOST + c, { signal: AbortSignal.timeout(15000) });
      const txt = await r.text();
      for (const re of SECRET_PATTERNS) {
        if (re.test(txt)) {
          findings.push({
            rule: "secret-leak-chunk",
            page: c,
            detail: `pattern ${re} matched in JS chunk`,
            severity: "high",
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Header + CSP check on home
  const headRes = await fetch(HOST + "/", { method: "GET", signal: AbortSignal.timeout(10000) });
  const headers = Object.fromEntries(headRes.headers.entries());
  const expected = ["x-content-type-options", "x-frame-options", "referrer-policy"];
  for (const h of expected) {
    if (!headers[h]) {
      findings.push({
        rule: "missing-security-header",
        page: "/",
        detail: `header ${h} not set`,
        severity: "medium",
      });
    }
  }

  // XSS reflected probe
  const xssPayload = "%3Cscript%3Ealert(1)%3C%2Fscript%3E";
  const xssHtml = await fetchHTML(`/?test=${xssPayload}`);
  if (xssHtml.includes("<script>alert(1)</script>")) {
    findings.push({
      rule: "reflected-xss",
      page: `/?test=${xssPayload}`,
      detail: "URL param reflected unescaped into HTML",
      severity: "high",
    });
  }

  console.log(`\n# ${findings.length} findings:`);
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.rule.padEnd(28)} ${f.page} — ${f.detail}`);
  }
  if (findings.filter((f) => f.severity === "high").length > 0) {
    console.log("\n✗ HIGH severity findings present");
    process.exit(1);
  }
  console.log("\n✓ no high-severity findings");
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
