import { NextRequest, NextResponse } from "next/server";
import { authFromRequest } from "./wallet-auth";

/**
 * Require a wallet-signed request whose pubkey matches a claimed owner_pubkey
 * in the request body. Returns NextResponse on failure (caller should return),
 * or null on success (caller continues).
 *
 * Pattern across save-for, round-up, scheduled-sends, auto-refill: the body
 * carries owner_pubkey naming whose data the request mutates. Without this
 * check, anyone could spam, hijack, or delete another wallet's records
 * (Bug #53 / Bug #54 class).
 */
export async function requireOwnerAuth(
  req: NextRequest,
  claimedOwner: string,
): Promise<NextResponse | null> {
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json(
      {
        error: "auth_required",
        reason: auth?.ok === false ? auth.reason : "missing",
      },
      { status: 401 },
    );
  }
  if (auth.pubkey !== claimedOwner) {
    return NextResponse.json(
      {
        error: "owner_mismatch",
        message: "signed pubkey does not match owner_pubkey in body",
      },
      { status: 403 },
    );
  }
  return null;
}
