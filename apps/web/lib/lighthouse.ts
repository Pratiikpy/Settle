/**
 * Lighthouse pre-tx assertion helpers.
 *
 * Lighthouse program: L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95
 * Source: https://github.com/Jac0xb/lighthouse
 *
 * AssertTokenAccount layout (Codama-generated client):
 *   accounts: [target_account (read-only)]
 *   data:     u8 ix_discriminator (9) + u8 log_level + TokenAccountAssertion
 *
 * TokenAccountAssertion enum tags (we use Amount):
 *   0 = Mint(Pubkey, EquatableOperator)
 *   1 = Owner(Pubkey, EquatableOperator)
 *   2 = Amount(u64, IntegerOperator)
 *   3 = Delegate(Option<Pubkey>, EquatableOperator)
 *   4 = State(u8, IntegerOperator)
 *   ...
 *
 * IntegerOperator: 0=Equal, 1=NotEqual, 2=GreaterThan, 3=LessThan, 4=GreaterThanOrEqual, 5=LessThanOrEqual
 * LogLevel:        0=Silent
 *
 * This is a hand-built ix because the published `@lighthouse-web3/clients` package targets
 * @solana/kit (not @solana/web3.js). The on-the-wire format is stable + small; we build
 * it here directly. Verified against
 *   github.com/Jac0xb/lighthouse/clients/kit-js/src/generated/instructions/assertTokenAccount.ts
 */

import { PublicKey, TransactionInstruction } from "@solana/web3.js";

export const LIGHTHOUSE_PROGRAM_ID = new PublicKey(
  process.env.LIGHTHOUSE_PROGRAM_ID ?? "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95",
);

const ASSERT_TOKEN_ACCOUNT_DISCRIMINATOR = 9;
const TOKEN_ACCOUNT_ASSERTION_AMOUNT = 2;

const INTEGER_OP_EQUAL = 0;
const INTEGER_OP_LESS_THAN_OR_EQUAL = 5;

const LOG_LEVEL_SILENT = 0;

export function isLighthouseEnabled(): boolean {
  return process.env.SETTLE_ENABLE_LIGHTHOUSE === "1";
}

/**
 * Build a Lighthouse AssertTokenAccount(Amount) ix.
 *
 * Append AFTER the spend ix to assert the token account's balance equals (or is at most)
 * the expected value. If anyone tampers (extra transfer, etc.) the assertion fails and
 * the whole transaction reverts atomically — defense-in-depth on top of the program's
 * own cap enforcement.
 *
 * Returns null when SETTLE_ENABLE_LIGHTHOUSE != "1" (so callers can append unconditionally).
 */
export function buildAssertTokenAccountAmountIx(params: {
  tokenAccount: PublicKey;
  expectedAmount: bigint;
  operator?: "equal" | "lte";
}): TransactionInstruction | null {
  if (!isLighthouseEnabled()) return null;

  const op = params.operator === "lte" ? INTEGER_OP_LESS_THAN_OR_EQUAL : INTEGER_OP_EQUAL;

  // u8 ix_discriminator + u8 log_level + u8 assertion_tag + u64_le value + u8 operator = 12 bytes
  const data = Buffer.alloc(1 + 1 + 1 + 8 + 1);
  let off = 0;
  data.writeUInt8(ASSERT_TOKEN_ACCOUNT_DISCRIMINATOR, off);
  off += 1;
  data.writeUInt8(LOG_LEVEL_SILENT, off);
  off += 1;
  data.writeUInt8(TOKEN_ACCOUNT_ASSERTION_AMOUNT, off);
  off += 1;
  data.writeBigUInt64LE(params.expectedAmount, off);
  off += 8;
  data.writeUInt8(op, off);

  return new TransactionInstruction({
    programId: LIGHTHOUSE_PROGRAM_ID,
    keys: [{ pubkey: params.tokenAccount, isSigner: false, isWritable: false }],
    data,
  });
}
