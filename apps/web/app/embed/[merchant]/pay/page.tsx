import { redirect } from "next/navigation";

// The embed pay widget lives at /embed/pay?merchant=<pubkey>.
// External integrations that constructed /embed/<merchant>/pay are
// redirected to the canonical URL so params are picked up correctly.
export default async function EmbedMerchantPayPage({
  params,
}: {
  params: Promise<{ merchant: string }>;
}) {
  const { merchant } = await params;
  redirect(`/embed/pay?merchant=${encodeURIComponent(merchant)}`);
}
