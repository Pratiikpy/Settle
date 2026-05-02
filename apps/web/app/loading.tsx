/**
 * Wave 6 — global loading fallback.
 *
 * Rendered by Next.js while a server component segment is streaming.
 * Light W6 surface keeps continuity with the rest of the app — no
 * black flash, same fonts, same palette.
 */
export default function GlobalLoading() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--w6-bg-2)",
        color: "var(--w6-ink)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 22,
            height: 22,
            border: "2px solid var(--w6-rule)",
            borderTopColor: "var(--w6-ink)",
            borderRadius: "50%",
            animation: "w6-spin 0.7s linear infinite",
          }}
        />
        <div className="w6-muted" style={{ fontSize: 12 }}>
          Loading…
        </div>
      </div>
      <style>{`@keyframes w6-spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
