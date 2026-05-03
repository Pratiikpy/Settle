#!/usr/bin/env tsx
/**
 * Resets transient test state so a fresh autonomous run starts clean:
 *   - Truncates phase5_executions for ALICE's pacts
 *   - Clears webhook receiver buffer
 *   - Reports current funding state
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const ALICE = "C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY";

  // Find ALICE's cards
  const { data: cards } = await sb
    .from("agent_cards")
    .select("card_pubkey")
    .eq("authority_pubkey", ALICE);
  const cardKeys = (cards ?? []).map((c) => c.card_pubkey as string);
  console.log(`# alice cards: ${cardKeys.length}`);

  // Count phase5_executions for those cards' pacts (don't actually delete; this is read-only diagnostic)
  if (cardKeys.length > 0) {
    const { data: pacts } = await sb
      .from("pacts")
      .select("pact_pubkey")
      .in("parent_card", cardKeys);
    const pactKeys = (pacts ?? []).map((p) => p.pact_pubkey as string);
    console.log(`# alice pacts: ${pactKeys.length}`);
    if (pactKeys.length > 0) {
      const { count } = await sb
        .from("phase5_executions")
        .select("*", { count: "exact", head: true })
        .in("pact_pubkey", pactKeys);
      console.log(`# phase5_executions for alice's pacts: ${count}`);
    }
  }

  // Try webhook receiver reset (best-effort)
  try {
    const r = await fetch("http://localhost:4000/reset", {
      method: "POST",
      signal: AbortSignal.timeout(2000),
    });
    console.log(`# webhook receiver reset: ${r.status}`);
  } catch {
    console.log(`# webhook receiver: not running`);
  }

  console.log("\n✓ test state surveyed (read-only — no truncation)");
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
