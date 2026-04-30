import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-foreground/10 px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xs">
          <div className="text-lg font-semibold tracking-tight">Settle</div>
          <p className="mt-2 text-xs text-foreground/50">
            Pay anyone. Hire any AI. Trust the receipts. The payment app for the AI age. On
            Solana.
          </p>
          <p className="mt-4 text-[10px] text-foreground/40">
            Solana Frontier 2026 · MIT-licensed SDK
          </p>
        </div>

        <div className="grid grid-cols-3 gap-8 text-xs">
          <div>
            <div className="mb-3 font-medium uppercase tracking-wider text-foreground/40">
              Product
            </div>
            <ul className="space-y-2 text-foreground/70">
              <li>
                <Link className="hover:text-foreground" href="/onboarding">
                  Get started
                </Link>
              </li>
              <li>
                <Link className="hover:text-foreground" href="/agents">
                  Hire AI
                </Link>
              </li>
              <li>
                <Link className="hover:text-foreground" href="/send">
                  Send
                </Link>
              </li>
              <li>
                <Link className="hover:text-foreground" href="/cards">
                  Cards
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <div className="mb-3 font-medium uppercase tracking-wider text-foreground/40">
              Build
            </div>
            <ul className="space-y-2 text-foreground/70">
              <li>
                <Link className="hover:text-foreground" href="/docs">
                  Docs
                </Link>
              </li>
              <li>
                <Link className="hover:text-foreground" href="/public-goods">
                  Public Goods
                </Link>
              </li>
              <li>
                <a
                  className="hover:text-foreground"
                  href="https://github.com/Pratiikpy/settle-protocol"
                >
                  GitHub
                </a>
              </li>
              <li>
                <Link className="hover:text-foreground" href="/security">
                  Security
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <div className="mb-3 font-medium uppercase tracking-wider text-foreground/40">
              Status
            </div>
            <ul className="space-y-2 text-foreground/70">
              <li>
                <Link className="hover:text-foreground" href="/api/health">
                  Health
                </Link>
              </li>
              <li>
                <Link className="hover:text-foreground" href="/feed">
                  Live feed
                </Link>
              </li>
              <li>
                <Link className="hover:text-foreground" href="/sandbox">
                  Devnet sandbox
                </Link>
              </li>
              <li>
                <Link className="hover:text-foreground" href="/help">
                  Help
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-10 flex max-w-6xl flex-col items-start justify-between gap-2 border-t border-foreground/5 pt-6 text-[10px] text-foreground/40 sm:flex-row sm:items-center">
        <div>© 2026 Settle Protocol contributors · MIT licensed</div>
        <div className="font-mono">
          {process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet"}
        </div>
      </div>
    </footer>
  );
}
