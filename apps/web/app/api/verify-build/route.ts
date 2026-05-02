import { NextResponse } from "next/server";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/verify-build
 *
 * F9.1 Verifiable build.
 *
 * Returns the SHA256 of the on-chain ProgramData bytecode + the SHA256 from
 * the committed `target/deploy/build-info.json` + a match/mismatch flag.
 *
 * If they match: the binary running on devnet is byte-identical to what's
 * committed at the published commit SHA. Anyone can clone the repo at that
 * commit, re-run `cargo build-sbf`, hash the resulting .so, and confirm.
 *
 * If they don't match: either (a) someone deployed an unannounced upgrade,
 * (b) build-info.json wasn't regenerated after the latest local build, or
 * (c) the committed binary in target/deploy/ is stale. The endpoint
 * returns both hashes so the operator can investigate.
 *
 * Public, no auth — verification is the public good.
 */

const PROGRAM_ID = new PublicKey(
  process.env.SETTLE_PROGRAM_ID ??
    "HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD",
);

interface BuildInfo {
  sha256: string;
  size_bytes: number;
  commit: string;
  dirty: boolean;
  built_at: string;
  builder: {
    hostname: string;
    platform: string;
    arch: string;
  };
}

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

function readBuildInfo(): BuildInfo | null {
  const path = resolve(
    process.cwd(),
    "programs/settle-agent-card/target/deploy/build-info.json",
  );
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as BuildInfo;
  } catch {
    return null;
  }
}

/**
 * Strip the upgradeable BPF loader's ProgramData header to get the raw
 * executable bytecode that we can hash.
 *
 * UpgradeableLoaderState::ProgramData layout:
 *   - 4 bytes: state tag (= 3)
 *   - 8 bytes: slot u64
 *   - 1 byte:  Option tag (0 = None, 1 = Some)
 *   - 32 bytes: upgrade authority pubkey (only if Option tag = 1)
 *   - N bytes: program bytecode
 *
 * Header total: 13 bytes if no upgrade authority, 45 bytes if there is one.
 */
function stripProgramDataHeader(data: Buffer): { code: Buffer; authority: PublicKey | null } {
  if (data.length < 13) {
    throw new Error("ProgramData buffer too short for header");
  }
  const tag = data.readUInt32LE(0);
  if (tag !== 3) {
    throw new Error(`expected ProgramData tag 3, got ${tag}`);
  }
  const optionTag = data.readUInt8(12);
  if (optionTag === 0) {
    return { code: data.subarray(13), authority: null };
  }
  if (optionTag === 1) {
    const authority = new PublicKey(data.subarray(13, 13 + 32));
    return { code: data.subarray(13 + 32), authority };
  }
  throw new Error(`invalid Option tag in ProgramData: ${optionTag}`);
}

export async function GET() {
  const conn = new Connection(getRpcUrl(), "confirmed");

  // Lookup the Program account to find the ProgramData address.
  const programInfo = await conn.getAccountInfo(PROGRAM_ID, "confirmed");
  if (!programInfo) {
    return NextResponse.json(
      { error: "program_not_found", program_id: PROGRAM_ID.toBase58() },
      { status: 404 },
    );
  }

  // Program account body: 4-byte tag (= 2 = Program) + 32-byte programdata pubkey.
  const programBuf = programInfo.data;
  if (programBuf.length < 4 + 32) {
    return NextResponse.json(
      { error: "unexpected_program_account_size", size: programBuf.length },
      { status: 502 },
    );
  }
  const programTag = programBuf.readUInt32LE(0);
  if (programTag !== 2) {
    return NextResponse.json(
      {
        error: "not_upgradeable_program",
        message: `Program account tag = ${programTag} (expected 2 = Program). Either this is a non-upgradeable program or the account is corrupted.`,
      },
      { status: 502 },
    );
  }
  const programDataAddress = new PublicKey(programBuf.subarray(4, 4 + 32));

  // Fetch the ProgramData account.
  const pdInfo = await conn.getAccountInfo(programDataAddress, "confirmed");
  if (!pdInfo) {
    return NextResponse.json(
      { error: "program_data_not_found", program_data: programDataAddress.toBase58() },
      { status: 502 },
    );
  }

  let onChainCode: Buffer;
  let onChainAuthority: PublicKey | null;
  try {
    const stripped = stripProgramDataHeader(pdInfo.data);
    onChainCode = stripped.code;
    onChainAuthority = stripped.authority;
  } catch (e) {
    return NextResponse.json(
      { error: "header_parse_failed", message: (e as Error).message },
      { status: 502 },
    );
  }

  // Trim trailing zero-padding so the hash is byte-stable across deploys.
  // UpgradeableLoader allocates more space than the program needs (for
  // future upgrades); the unused bytes are zero. We hash the prefix up
  // to the file's actual size as recorded in build-info.json.
  const buildInfo = readBuildInfo();

  let onChainHashHex: string;
  if (buildInfo) {
    const trimmed = onChainCode.subarray(0, buildInfo.size_bytes);
    onChainHashHex = createHash("sha256").update(trimmed).digest("hex");
  } else {
    // No build-info to size-trim against; hash the raw code bytes including
    // any trailing zeros. Won't match a fresh local build but at least
    // returns SOMETHING the operator can compare manually.
    onChainHashHex = createHash("sha256").update(onChainCode).digest("hex");
  }

  return NextResponse.json({
    ok: true,
    program_id: PROGRAM_ID.toBase58(),
    program_data_address: programDataAddress.toBase58(),
    upgrade_authority: onChainAuthority?.toBase58() ?? null,
    on_chain: {
      sha256: onChainHashHex,
      // Whether the trim was applied — important for diagnosis.
      sized_against_build_info: Boolean(buildInfo),
      raw_code_bytes: onChainCode.length,
    },
    claimed: buildInfo
      ? {
          sha256: buildInfo.sha256,
          size_bytes: buildInfo.size_bytes,
          commit: buildInfo.commit,
          dirty: buildInfo.dirty,
          built_at: buildInfo.built_at,
          builder: buildInfo.builder,
        }
      : null,
    matches: buildInfo ? buildInfo.sha256 === onChainHashHex : null,
  });
}
