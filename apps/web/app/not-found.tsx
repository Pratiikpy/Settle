import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="text-7xl font-semibold tracking-tight text-gradient">404</div>
      <p className="mt-6 text-lg text-foreground/70">This page doesn&apos;t exist on Solana.</p>
      <p className="mt-2 text-sm text-foreground/40">
        Maybe the link is wrong, or the resource was revoked.
      </p>
      <Link
        href="/"
        className="mt-10 inline-flex h-11 items-center justify-center rounded-full bg-accent px-6 text-sm font-medium text-background"
      >
        Back to home
      </Link>
    </main>
  );
}
