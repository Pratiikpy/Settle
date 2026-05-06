import { PersonaPage } from "../../../components/persona-page";

export const dynamic = "force-static";
export const metadata = {
  title: "Accept payments Â· Settle",
  description:
    "Three steps to your first verified sale on Solana. Claim a merchant handle, generate a payment QR or link, wire your webhook for instant settlement signals.",
};

export default function MerchantOnboarding() {
  return (
    <PersonaPage
      testId="onboard-merchant"
      title="Accept payments."
      subtitle="Three steps to your first verified sale."
      steps={[
        {
          n: 1,
          title: "Connect your wallet",
          body: "Your wallet becomes your merchant identity. Customers will see use-settle.vercel.app/m/<handle> once you take your first payment or publish a capability.",
          ctaText: "Open manage",
          ctaHref: "/m/me/manage",
        },
        {
          n: 2,
          title: "Generate a payment QR or link",
          body: "Print it, share it, embed it. Every payment carries a verifiable receipt back to the customer.",
          ctaText: "Open merchant page",
          ctaHref: "/m/me",
        },
        {
          n: 3,
          title: "Wire your webhook",
          body: "Get a signed event the moment a customer pays. Use it for fulfillment, accounting, or analytics.",
          ctaText: "Configure webhook",
          ctaHref: "/m/me/webhook",
        },
      ]}
      whatNext={[
        { label: "Verify your domain", href: "/m/me/verify" },
        { label: "Publish a verified service", href: "/m/me/capabilities" },
        { label: "View analytics", href: "/m/me/analytics" },
      ]}
    />
  );
}
