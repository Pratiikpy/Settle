import { PersonaPage } from "../../../components/persona-page";

export const dynamic = "force-static";
export const metadata = {
  title: "Send money safely · Settle",
  description:
    "Three steps to your first cryptographic receipt on Solana. Connect a wallet, send a test transfer on devnet, get a receipt you can verify forever.",
};

export default function ConsumerOnboarding() {
  return (
    <PersonaPage
      testId="onboard-consumer"
      title="Send money safely."
      subtitle="Three steps to your first receipt."
      steps={[
        {
          n: 1,
          title: "Connect a Solana wallet",
          body: "Phantom, Solflare, Backpack — anything that holds devnet USDC works. The Send page has the wallet button in the top-right.",
          ctaText: "Open Send and connect",
          ctaHref: "/send",
        },
        {
          n: 2,
          title: "Send $0.01 to a second wallet",
          body: "Route it on Solana devnet. The transaction confirms in under a second and writes a four-hash receipt.",
          ctaText: "Open Send",
          ctaHref: "/send",
        },
        {
          n: 3,
          title: "Get a receipt you can verify forever",
          body: "Every send writes a 4-hash chain on Solana. Share the link or verify it later.",
          ctaText: "View receipts",
          ctaHref: "/ledger",
        },
      ]}
      whatNext={[
        { label: "Set a spending rule", href: "/cards/new" },
        { label: "Schedule a recurring send", href: "/allowances" },
        { label: "Save toward a goal", href: "/wishes" },
      ]}
    />
  );
}
