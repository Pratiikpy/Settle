#!/usr/bin/env tsx
/**
 * Confirms migrations 0019/0020/0021 landed by selecting the new columns/tables.
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing env");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const checks: Array<{ label: string; fn: () => Promise<string> }> = [
    {
      label: "0019 receipts.receipt_kind + context_hash",
      fn: async () => {
        const { error } = await sb
          .from("receipts")
          .select("receipt_kind, context_hash")
          .limit(1);
        if (error) throw error;
        return "ok";
      },
    },
    {
      label: "0019 kernel_receipt_attestations table",
      fn: async () => {
        const { error } = await sb
          .from("kernel_receipt_attestations")
          .select("sig_solscan")
          .limit(1);
        if (error) throw error;
        return "ok";
      },
    },
    {
      label: "0020 receipts.narration_text + refund_emoji",
      fn: async () => {
        const { error } = await sb
          .from("receipts")
          .select("narration_text, narration_provider, narration_generated_at, refund_emoji")
          .limit(1);
        if (error) throw error;
        return "ok";
      },
    },
    {
      label: "0020 refund_requests.emoji",
      fn: async () => {
        const { error } = await sb
          .from("refund_requests")
          .select("emoji")
          .limit(1);
        if (error) throw error;
        return "ok";
      },
    },
    {
      label: "0021 agent_trust_scores table",
      fn: async () => {
        const { error } = await sb
          .from("agent_trust_scores")
          .select("pubkey, score, tier")
          .limit(1);
        if (error) throw error;
        return "ok";
      },
    },
  ];

  let ok = 0;
  let failed = 0;
  for (const c of checks) {
    try {
      await c.fn();
      console.log(`  ✓ ${c.label}`);
      ok++;
    } catch (e) {
      console.log(`  ✗ ${c.label} — ${(e as Error).message}`);
      failed++;
    }
  }
  console.log(`\n${ok}/${ok + failed} checks passed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
