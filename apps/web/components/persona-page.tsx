import Link from "next/link";

export function PersonaPage(props: {
  testId: string;
  title: string;
  subtitle: string;
  steps: Array<{
    n: number;
    title: string;
    body: string;
    ctaText: string;
    ctaHref: string;
  }>;
  whatNext: Array<{ label: string; href: string }>;
}) {
  return (
    <main
      data-testid={props.testId}
      style={{
        minHeight: "100vh",
        background: "var(--w6-bg-2, #fafaf7)",
        color: "var(--w6-ink, #0a0a0c)",
        fontFamily:
          "ui-sans-serif, -apple-system, system-ui, Segoe UI, Roboto, sans-serif",
        padding: "32px 16px 64px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link
          href="/start"
          style={{ fontSize: 13, color: "inherit", textDecoration: "none" }}
        >
          ← Pick a different path
        </Link>
        <header style={{ marginTop: 24 }}>
          <h1
            style={{
              fontSize: "clamp(32px, 5vw, 48px)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            {props.title}
          </h1>
          <p
            style={{
              marginTop: 12,
              fontSize: 17,
              color: "var(--w6-ink-3, #5a5f66)",
            }}
          >
            {props.subtitle}
          </p>
        </header>

        <ol style={{ marginTop: 36, padding: 0, listStyle: "none" }}>
          {props.steps.map((s) => (
            <li
              key={s.n}
              data-testid={`onboard-step-${s.n}`}
              style={{
                display: "flex",
                gap: 18,
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 14,
                padding: 22,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "#0a0a0c",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {s.n}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                  {s.title}
                </h3>
                <p
                  style={{
                    margin: "6px 0 0",
                    color: "var(--w6-ink-3, #5a5f66)",
                    fontSize: 14.5,
                    lineHeight: 1.55,
                  }}
                >
                  {s.body}
                </p>
                <Link
                  href={s.ctaHref}
                  style={{
                    marginTop: 14,
                    display: "inline-block",
                    padding: "8px 14px",
                    borderRadius: 8,
                    background: "#0a0a0c",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  {s.ctaText} →
                </Link>
              </div>
            </li>
          ))}
        </ol>

        <section style={{ marginTop: 44 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--w6-ink-3, #5a5f66)",
              letterSpacing: "0.04em",
            }}
          >
            WHAT'S NEXT
          </div>
          <div
            style={{
              marginTop: 12,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {props.whatNext.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,0.12)",
                  fontSize: 13,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                {n.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
