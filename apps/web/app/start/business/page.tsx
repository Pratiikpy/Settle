import { redirect } from "next/navigation";

// /start/business is the same onboarding flow as /start/merchant.
// Redirecting rather than duplicating keeps one source of truth.
export default function StartBusinessPage() {
  redirect("/start/merchant");
}
