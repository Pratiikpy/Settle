/**
 * Solana Attestation Service (SAS) — verified-merchant queries.
 *
 * Canonical program (Solana Foundation):
 *   Program ID: 22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG
 *   Source:     https://github.com/solana-foundation/solana-attestation-service
 *
 * PDA model:
 *   Credential PDA   = [b"credential", authority.toBytes(), name]
 *   Schema PDA       = [b"schema", credential.toBytes(), name, [version]]
 *   Attestation PDA  = [b"attestation", credential.toBytes(), schema.toBytes(), nonce.toBytes()]
 *
 * For Settle's verified-merchant flow:
 *   - Operator publishes a Credential (settle.so as the issuer authority)
 *   - Operator publishes a "VerifiedSettleMerchant" Schema under that Credential
 *   - For each verified merchant pubkey M, operator creates an Attestation with nonce=M
 *     so the Attestation PDA is deterministically derivable from any merchant pubkey.
 *
 * On-chain Attestation account layout (v0.x SAS):
 *   discriminator(1) | nonce(32) | credential(32) | schema(32) | data(4+len) |
 *   signer(32) | expiry(i64) | token_account(32)
 *
 * This module:
 *   1. Derives the attestation PDA for a merchant
 *   2. Fetches it
 *   3. Decodes nonce/credential/schema/expiry
 *   4. Validates expiry hasn't passed
 *   5. Cross-checks nonce == merchant pubkey (must be true by Settle's setup convention)
 *
 * Fallback to Supabase verified_merchants table (trusted_db) when SAS env vars are unset
 * or when SETTLE_SAS_FAIL_OPEN=1. Reading verified_merchants is the responsibility of
 * upstream code in the proxy — see /api/x402/proxy/[merchant]/route.ts.
 */

import { Connection, PublicKey } from "@solana/web3.js";

export const SAS_PROGRAM_ID = new PublicKey(
  process.env.SAS_PROGRAM_ID ?? "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG",
);

const ATTESTATION_SEED = Buffer.from("attestation");

export interface SasVerificationResult {
  verified: boolean;
  source: "sas_attestation" | "trusted_db" | "not_verified";
  attestation_pda?: string;
  credential?: string;
  schema?: string;
  expires_at?: string;
}

interface DecodedAttestation {
  discriminator: number;
  nonce: Buffer;
  credential: Buffer;
  schema: Buffer;
  data: Buffer;
  signer: Buffer;
  expiry: bigint;
  tokenAccount: Buffer;
}

function decodeAttestation(raw: Buffer): DecodedAttestation | null {
  // Layout: discriminator(1) + nonce(32) + credential(32) + schema(32) + data(4+len) + signer(32) + expiry(i64) + token_account(32)
  if (raw.length < 1 + 32 + 32 + 32 + 4 + 32 + 8 + 32) return null;
  let off = 0;
  const discriminator = raw.readUInt8(off);
  off += 1;
  const nonce = raw.subarray(off, off + 32);
  off += 32;
  const credential = raw.subarray(off, off + 32);
  off += 32;
  const schema = raw.subarray(off, off + 32);
  off += 32;
  const dataLen = raw.readUInt32LE(off);
  off += 4;
  if (off + dataLen + 8 + 32 > raw.length) return null;
  const data = raw.subarray(off, off + dataLen);
  off += dataLen;
  const signer = raw.subarray(off, off + 32);
  off += 32;
  const expiry = raw.readBigInt64LE(off);
  off += 8;
  const tokenAccount = raw.subarray(off, off + 32);
  return { discriminator, nonce, credential, schema, data, signer, expiry, tokenAccount };
}

/**
 * Derive Settle's attestation PDA for a merchant pubkey.
 * Convention: nonce == merchantPubkey, so the PDA is deterministically derivable.
 */
export function deriveSettleMerchantAttestationPda(
  credentialPda: PublicKey,
  schemaPda: PublicKey,
  merchantPubkey: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ATTESTATION_SEED, credentialPda.toBuffer(), schemaPda.toBuffer(), merchantPubkey.toBuffer()],
    SAS_PROGRAM_ID,
  );
}

/**
 * Check if a merchant has a valid Settle SAS attestation.
 *
 * Required env:
 *   - SETTLE_SAS_CREDENTIAL_PDA  — the Credential PDA Settle controls (issuer)
 *   - SETTLE_SAS_SCHEMA_PDA      — the "VerifiedSettleMerchant" Schema PDA
 *
 * If either is unset → falls back to `trusted_db` mode (caller responsible for
 * checking Supabase verified_merchants).
 *
 * If both are set → derives attestation PDA, fetches, decodes, validates expiry.
 * If decode succeeds and expiry is in the future (or 0 = never expires), returns
 * `verified: true, source: "sas_attestation"`. Otherwise returns
 * `verified: false, source: "not_verified"` (unless SETTLE_SAS_FAIL_OPEN=1).
 */
export async function checkMerchantSasAttestation(
  connection: Connection,
  merchantPubkey: PublicKey,
): Promise<SasVerificationResult> {
  const credentialStr = process.env.SETTLE_SAS_CREDENTIAL_PDA;
  const schemaStr = process.env.SETTLE_SAS_SCHEMA_PDA;
  const failOpen = process.env.SETTLE_SAS_FAIL_OPEN === "1";

  if (!credentialStr || !schemaStr) {
    return { verified: true, source: "trusted_db" };
  }

  let credential: PublicKey;
  let schema: PublicKey;
  try {
    credential = new PublicKey(credentialStr);
    schema = new PublicKey(schemaStr);
  } catch {
    return failOpen
      ? { verified: true, source: "trusted_db" }
      : { verified: false, source: "not_verified" };
  }

  const [attestationPda] = deriveSettleMerchantAttestationPda(credential, schema, merchantPubkey);

  let info;
  try {
    info = await connection.getAccountInfo(attestationPda, "confirmed");
  } catch {
    return failOpen
      ? { verified: true, source: "trusted_db" }
      : { verified: false, source: "not_verified" };
  }

  if (!info) {
    return { verified: false, source: "not_verified" };
  }
  if (!info.owner.equals(SAS_PROGRAM_ID)) {
    return { verified: false, source: "not_verified" };
  }

  const decoded = decodeAttestation(Buffer.from(info.data));
  if (!decoded) {
    return { verified: false, source: "not_verified" };
  }

  // Cross-check nonce == merchant (Settle's deterministic-PDA convention)
  if (!Buffer.from(decoded.nonce).equals(merchantPubkey.toBuffer())) {
    return { verified: false, source: "not_verified" };
  }
  if (!Buffer.from(decoded.credential).equals(credential.toBuffer())) {
    return { verified: false, source: "not_verified" };
  }
  if (!Buffer.from(decoded.schema).equals(schema.toBuffer())) {
    return { verified: false, source: "not_verified" };
  }

  // Expiry: 0 = never expires; otherwise must be > now (unix seconds)
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  if (decoded.expiry !== 0n && decoded.expiry < nowSec) {
    return { verified: false, source: "not_verified" };
  }

  return {
    verified: true,
    source: "sas_attestation",
    attestation_pda: attestationPda.toBase58(),
    credential: credential.toBase58(),
    schema: schema.toBase58(),
    expires_at: decoded.expiry === 0n ? "never" : new Date(Number(decoded.expiry) * 1000).toISOString(),
  };
}
