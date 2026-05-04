#!/usr/bin/env tsx
/**
 * verify-idl — Codama-equivalent IDL drift detector.
 *
 * The hand-maintained `packages/sdk/src/idl.ts::SETTLE_IDL` is the runtime client's
 * source of truth. The Anchor-generated `programs/settle-agent-card/target/idl/
 * settle_agent_card.json` is the truth derived from the Rust source itself.
 *
 * If those drift, every ix builder breaks at runtime with InstructionDidNotDeserialize.
 * This script catches the drift before it ships.
 *
 * Run locally after every `anchor build`:
 *   pnpm verify:idl
 *
 * Run in CI on every PR. Fails red on any structural mismatch.
 *
 * What we compare:
 *   - Instruction names + arg name+type pairs (in order).
 *   - Account names + field name+type pairs (in order).
 *   - Type names + variant/field structure.
 *   - Event names + field name+type pairs (in order).
 *
 * What we ignore:
 *   - `docs` arrays (free-form prose).
 *   - `metadata` (version stamps).
 *   - Field-level `docs` annotations.
 *
 * If the IDL JSON file is missing, the script fails with a clear instruction
 * to run `anchor build` and commit the generated artifact. CI catches "I forgot
 * to run anchor build before pushing."
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { SETTLE_IDL } from "@settle/sdk";

const IDL_JSON_PATH = resolve(
  process.cwd(),
  "programs/settle-agent-card/target/idl/settle_agent_card.json",
);

interface CanonicalField {
  name: string;
  type: string;
}

interface CanonicalIx {
  name: string;
  args: CanonicalField[];
}

interface CanonicalAccount {
  name: string;
  fields: CanonicalField[];
}

interface CanonicalType {
  name: string;
  kind: "struct" | "enum";
  fields: CanonicalField[]; // for structs
  variants: { name: string; fields: CanonicalField[] }[]; // for enums
}

interface CanonicalEvent {
  name: string;
  fields: CanonicalField[];
}

interface CanonicalIdl {
  instructions: CanonicalIx[];
  accounts: CanonicalAccount[];
  types: CanonicalType[];
  events: CanonicalEvent[];
}

/**
 * Stable type-name normalizer. Anchor IDL types come in many shapes:
 *   "u64"
 *   "publicKey"
 *   { array: ["u8", 32] }
 *   { vec: { defined: "AllowlistEntry" } }
 *   { option: { array: ["u8", 32] } }
 *   { defined: "PactMode" }
 *
 * Some Anchor versions also emit "pubkey" instead of "publicKey", or wrap defined
 * types as `{ defined: { name: "X" } }` instead of `{ defined: "X" }`. We normalize
 * to a single canonical string form so trivial format differences don't fail the diff.
 */
function normalizeType(t: unknown): string {
  if (typeof t === "string") {
    if (t === "pubkey") return "publicKey";
    return t;
  }
  if (t === null || t === undefined) return "void";
  if (typeof t !== "object") return String(t);
  const obj = t as Record<string, unknown>;

  if ("array" in obj) {
    const a = obj.array as [unknown, number];
    return `array<${normalizeType(a[0])}, ${a[1]}>`;
  }
  if ("vec" in obj) {
    return `vec<${normalizeType(obj.vec)}>`;
  }
  if ("option" in obj) {
    return `option<${normalizeType(obj.option)}>`;
  }
  if ("defined" in obj) {
    const d = obj.defined;
    // Anchor 0.30+ wraps `{ defined: { name: "X" } }`; older was `{ defined: "X" }`.
    if (typeof d === "string") return `defined<${d}>`;
    if (d && typeof d === "object" && "name" in d) {
      return `defined<${(d as { name: string }).name}>`;
    }
  }
  return JSON.stringify(t);
}

function normalizeFields(fields: unknown): CanonicalField[] {
  if (!Array.isArray(fields)) return [];
  return fields.map((f) => {
    const r = f as { name: string; type: unknown };
    return { name: r.name, type: normalizeType(r.type) };
  });
}

/**
 * Anchor's IDL has `types[]` and `accounts[]` separately — accounts are typically
 * a special case that ALSO appears in types. The hand-maintained idl.ts inlines
 * the account fields under `accounts[].type.fields` directly. To compare, we
 * extract `accounts[].type.fields` as the source of truth on both sides.
 */
function extractAccountFields(account: unknown): CanonicalField[] {
  const a = account as {
    type?: { fields?: unknown };
    fields?: unknown;
    discriminator?: unknown;
  };
  if (a.type && Array.isArray(a.type.fields)) return normalizeFields(a.type.fields);
  if (Array.isArray(a.fields)) return normalizeFields(a.fields);
  return [];
}

/**
 * For Anchor 0.30+ generated IDL, account *bodies* live in `types[]`, not in
 * `accounts[]` (the accounts array just lists names + discriminators). Resolve
 * each account name to its corresponding type entry to get fields.
 */
function resolveAccountFields(
  account: { name: string },
  types: Array<{ name: string; type?: { fields?: unknown } }>,
): CanonicalField[] {
  const directFields = extractAccountFields(account);
  if (directFields.length > 0) return directFields;
  const typeEntry = types.find((t) => t.name === account.name);
  if (!typeEntry) return [];
  return extractAccountFields(typeEntry);
}

function canonicalizeIdl(rawIdl: unknown): CanonicalIdl {
  const idl = rawIdl as {
    instructions?: unknown[];
    accounts?: unknown[];
    types?: unknown[];
    events?: unknown[];
  };

  const instructions: CanonicalIx[] = (idl.instructions ?? []).map((ix) => {
    const i = ix as { name: string; args?: unknown[] };
    return {
      name: i.name,
      args: normalizeFields(i.args ?? []),
    };
  });

  const types = (idl.types ?? []) as Array<{
    name: string;
    type?: { kind?: string; fields?: unknown; variants?: unknown };
  }>;

  const canonicalTypes: CanonicalType[] = types.map((t) => {
    const inner = t.type ?? {};
    const kind = (inner.kind ?? "struct") as "struct" | "enum";
    if (kind === "enum") {
      const variants = (inner.variants ?? []) as Array<{
        name: string;
        fields?: unknown;
      }>;
      return {
        name: t.name,
        kind: "enum",
        fields: [],
        variants: variants.map((v) => ({
          name: v.name,
          fields: normalizeFields(v.fields ?? []),
        })),
      };
    }
    return {
      name: t.name,
      kind: "struct",
      fields: normalizeFields(inner.fields ?? []),
      variants: [],
    };
  });

  const accounts: CanonicalAccount[] = (idl.accounts ?? []).map((a) => {
    const acc = a as { name: string };
    return {
      name: acc.name,
      fields: resolveAccountFields(acc, types),
    };
  });

  const events: CanonicalEvent[] = (idl.events ?? []).map((e) => {
    const ev = e as { name: string; fields?: unknown };
    return {
      name: ev.name,
      fields: normalizeFields(ev.fields ?? []),
    };
  });

  // Sort each list by name to make the diff order-stable. Internal field order
  // within each ix/account/event MATTERS (it's the borsh layout) so we DON'T sort
  // those.
  instructions.sort((a, b) => a.name.localeCompare(b.name));
  accounts.sort((a, b) => a.name.localeCompare(b.name));
  canonicalTypes.sort((a, b) => a.name.localeCompare(b.name));
  events.sort((a, b) => a.name.localeCompare(b.name));

  return { instructions, accounts, types: canonicalTypes, events };
}

interface DriftReport {
  category: "instructions" | "accounts" | "types" | "events";
  detail: string;
}

function diffArrays<T extends { name: string }>(
  category: DriftReport["category"],
  fromIdlJson: T[],
  fromIdlTs: T[],
  fieldComparator: (a: T, b: T, name: string) => string[],
): DriftReport[] {
  const drift: DriftReport[] = [];
  const jsonNames = new Set(fromIdlJson.map((x) => x.name));
  const tsNames = new Set(fromIdlTs.map((x) => x.name));

  for (const n of jsonNames) {
    if (!tsNames.has(n)) {
      drift.push({
        category,
        detail: `[${n}] present in target/idl JSON but missing from packages/sdk/src/idl.ts`,
      });
    }
  }
  for (const n of tsNames) {
    if (!jsonNames.has(n)) {
      drift.push({
        category,
        detail: `[${n}] present in packages/sdk/src/idl.ts but missing from target/idl JSON`,
      });
    }
  }

  for (const a of fromIdlJson) {
    const b = fromIdlTs.find((x) => x.name === a.name);
    if (!b) continue;
    const innerDrifts = fieldComparator(a, b, a.name);
    for (const d of innerDrifts) {
      drift.push({ category, detail: `[${a.name}] ${d}` });
    }
  }

  return drift;
}

function compareFields(
  a: CanonicalField[],
  b: CanonicalField[],
  label: string,
): string[] {
  const drift: string[] = [];
  if (a.length !== b.length) {
    drift.push(
      `${label}: count mismatch (target/idl JSON has ${a.length}, idl.ts has ${b.length})`,
    );
  }
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const fa = a[i];
    const fb = b[i];
    if (!fa) {
      drift.push(`${label}[${i}]: missing in target/idl JSON (idl.ts has '${fb!.name}')`);
      continue;
    }
    if (!fb) {
      drift.push(`${label}[${i}]: missing in idl.ts (target/idl JSON has '${fa.name}')`);
      continue;
    }
    if (fa.name !== fb.name) {
      drift.push(`${label}[${i}]: name mismatch (json='${fa.name}', ts='${fb.name}')`);
    }
    if (fa.type !== fb.type) {
      drift.push(`${label}[${i}].type: '${fa.type}' (json) vs '${fb.type}' (ts)`);
    }
  }
  return drift;
}

function diff(json: CanonicalIdl, ts: CanonicalIdl): DriftReport[] {
  const drift: DriftReport[] = [];

  drift.push(
    ...diffArrays("instructions", json.instructions, ts.instructions, (a, b) =>
      compareFields(a.args, b.args, "args"),
    ),
  );
  drift.push(
    ...diffArrays("accounts", json.accounts, ts.accounts, (a, b) =>
      compareFields(a.fields, b.fields, "fields"),
    ),
  );
  drift.push(
    ...diffArrays("types", json.types, ts.types, (a, b) => {
      const inner: string[] = [];
      if (a.kind !== b.kind) {
        inner.push(`kind: '${a.kind}' (json) vs '${b.kind}' (ts)`);
        return inner;
      }
      if (a.kind === "struct") {
        inner.push(...compareFields(a.fields, b.fields, "fields"));
      } else {
        const aNames = a.variants.map((v) => v.name).sort();
        const bNames = b.variants.map((v) => v.name).sort();
        if (JSON.stringify(aNames) !== JSON.stringify(bNames)) {
          inner.push(
            `variant set mismatch — json: [${aNames.join(",")}], ts: [${bNames.join(",")}]`,
          );
        }
        for (const av of a.variants) {
          const bv = b.variants.find((x) => x.name === av.name);
          if (!bv) continue;
          inner.push(...compareFields(av.fields, bv.fields, `variant<${av.name}>.fields`));
        }
      }
      return inner;
    }),
  );
  // Anchor 0.31.x stopped emitting event field metadata in target/idl JSON
  // (the JSON has empty `fields` arrays for every event); idl.ts still
  // carries the canonical event-field shape used by the indexer to byte-parse
  // logs. Skip the per-field comparison for events when the JSON side is
  // empty — drift then only flags missing/extra event NAMES, which is the
  // signal we still want.
  drift.push(
    ...diffArrays("events", json.events, ts.events, (a, b) => {
      if (a.fields.length === 0 && b.fields.length > 0) {
        // Anchor stripped event fields; trust idl.ts as the canonical
        // source. No drift to report at the field level.
        return [];
      }
      return compareFields(a.fields, b.fields, "fields");
    }),
  );

  return drift;
}

function main(): void {
  // --bootstrap mode: write the current SETTLE_IDL TS literal as the on-disk JSON
  // baseline. Use this once on a fresh checkout when `anchor build` isn't yet
  // available locally — gives the drift detector something to compare against
  // until the real build is run. Future anchor builds will overwrite this with
  // the canonical Anchor output, and the drift detector verifies they match.
  if (process.argv.includes("--bootstrap")) {
    mkdirSync(dirname(IDL_JSON_PATH), { recursive: true });
    writeFileSync(IDL_JSON_PATH, JSON.stringify(SETTLE_IDL, null, 2) + "\n", "utf8");
    console.log(`✓ Wrote bootstrap IDL JSON to ${IDL_JSON_PATH}`);
    console.log(
      `  This is a TS-literal-derived baseline. Replace with the real anchor build\n` +
        `  artifact via 'cd programs/settle-agent-card && anchor build' as soon as you\n` +
        `  have the toolchain available locally.`,
    );
    process.exit(0);
  }

  if (!existsSync(IDL_JSON_PATH)) {
    console.error(
      `\n❌ Anchor-generated IDL JSON missing at:\n   ${IDL_JSON_PATH}\n\n` +
        `Run one of:\n` +
        `   cd programs/settle-agent-card && anchor build   # canonical: real Rust → IDL\n` +
        `   pnpm verify:idl --bootstrap                     # seed from SETTLE_IDL TS literal\n\n` +
        `Then commit the produced JSON file. The Codama drift-detector compares it\n` +
        `against the hand-maintained packages/sdk/src/idl.ts on every CI run.\n`,
    );
    process.exit(1);
  }

  const jsonRaw = JSON.parse(readFileSync(IDL_JSON_PATH, "utf8")) as unknown;
  const tsRaw = SETTLE_IDL as unknown;

  const json = canonicalizeIdl(jsonRaw);
  const ts = canonicalizeIdl(tsRaw);

  const drifts = diff(json, ts);

  if (drifts.length === 0) {
    console.log(
      `✓ idl.ts matches target/idl/settle_agent_card.json — no drift across\n` +
        `  ${json.instructions.length} instructions, ${json.accounts.length} accounts, ` +
        `${json.types.length} types, ${json.events.length} events.`,
    );
    process.exit(0);
  }

  console.error(
    `\n❌ IDL drift detected between target/idl/settle_agent_card.json and ` +
      `packages/sdk/src/idl.ts:\n`,
  );
  const grouped: Record<string, string[]> = {};
  for (const d of drifts) {
    if (!grouped[d.category]) grouped[d.category] = [];
    grouped[d.category]!.push(d.detail);
  }
  for (const [category, items] of Object.entries(grouped)) {
    console.error(`  ${category}:`);
    for (const item of items) {
      console.error(`    - ${item}`);
    }
  }
  console.error(
    `\nFix: update packages/sdk/src/idl.ts to match the Anchor-generated IDL. ` +
      `If you intentionally changed the program, regenerate the IDL via anchor build ` +
      `and commit the new target/idl/settle_agent_card.json alongside the idl.ts edit.\n`,
  );
  process.exit(2);
}

main();
