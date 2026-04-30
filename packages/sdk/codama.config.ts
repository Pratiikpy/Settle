/**
 * Codama codegen config for @settle/sdk.
 *
 * After `pnpm deploy:devnet` runs `anchor build`, the IDL is at:
 *   programs/settle-agent-card/target/idl/settle_agent_card.json
 *
 * Run codegen via:
 *   pnpm --filter @settle/sdk codegen
 *
 * Output goes to packages/sdk/src/generated/ and gets re-exported from the SDK index,
 * superseding the hand-written ix builders in apps/web/lib/anchor-client.ts (which can
 * be removed once codegen runs).
 *
 * V1: this config is a stub — Codama needs additional packages installed:
 *   @codama/nodes-from-anchor
 *   @codama/renderers-js
 * Add them when ready to switch from hand-written to generated client.
 *
 * For now we keep the hand-written client; the IDL JSON in packages/sdk/src/idl.ts is
 * the truth and the hand-written builders match it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const IDL_PATH = resolve(
  process.cwd(),
  "..",
  "..",
  "programs",
  "settle-agent-card",
  "target",
  "idl",
  "settle_agent_card.json",
);

const OUTPUT_DIR = resolve(process.cwd(), "src", "generated");

export const config = {
  idlPath: IDL_PATH,
  outputDir: OUTPUT_DIR,
  programName: "settle_agent_card",
  // Wire renderers when packages installed:
  // import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
  // import { renderJavaScriptVisitor } from "@codama/renderers-js";
};

// CLI entrypoint — usage: pnpm tsx codama.config.ts
if (import.meta.url.endsWith(process.argv[1] ?? "")) {
  console.log("Codama codegen for @settle/sdk");
  console.log("─────────────────────────────────");
  console.log(`IDL path:   ${IDL_PATH}`);
  console.log(`Output dir: ${OUTPUT_DIR}`);
  console.log("");

  try {
    const idl = JSON.parse(readFileSync(IDL_PATH, "utf8"));
    console.log(`✓ IDL loaded: ${idl.name} v${idl.version} with ${idl.instructions?.length ?? 0} ixs`);
    console.log("");
    console.log("Codama renderer not wired yet. To enable:");
    console.log("  1. pnpm add -D -w @codama/nodes-from-anchor @codama/renderers-js codama");
    console.log("  2. Replace this stub with a real renderer pipeline.");
    console.log("");
    console.log("Until then: the hand-written client at apps/web/lib/anchor-client.ts is the truth.");
  } catch (e) {
    console.error("✗ Failed to load IDL — run `anchor build` first:", (e as Error).message);
    process.exit(1);
  }
}
