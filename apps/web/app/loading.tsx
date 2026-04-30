export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="space-y-3">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-white/[0.04]" />
        <div className="h-4 w-72 animate-pulse rounded-lg bg-white/[0.03]" />
      </div>
      <div className="mt-8 grid gap-4">
        <div className="h-32 animate-pulse rounded-2xl border border-foreground/10 bg-white/[0.02]" />
        <div className="h-32 animate-pulse rounded-2xl border border-foreground/10 bg-white/[0.02]" />
      </div>
    </main>
  );
}
