// Settle x Ika sidetrack — shared validation primitives for the
// `/api/crosschain/*` route handlers.
//
// Extracted to the SDK so server route handlers and any future TypeScript
// client share one source of truth. Unit tests live in
// `crosschain-validation.test.ts` and run under the existing SDK Vitest.

import { z } from "zod";

const HEX_64 = /^[0-9a-f]{64}$/;
const PUBKEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Schema for `POST /api/crosschain/sign` request bodies.
 *
 * Bumped when the client request shape evolves.
 */
export const SignRequestSchema = z.object({
  card_pubkey: z.string().regex(PUBKEY, "card_pubkey must be a base58 Solana pubkey"),
  request_id: z.string().regex(UUID, "request_id must be a UUID v4"),
  message_digest_hex: z
    .string()
    .regex(HEX_64, "message_digest_hex must be 64-char lowercase hex"),
  user_pubkey_hex: z
    .string()
    .regex(HEX_64, "user_pubkey_hex must be 64-char lowercase hex"),
  signature_scheme: z
    .number()
    .int()
    .min(0, "signature_scheme must be 0..6")
    .max(6, "signature_scheme must be 0..6"),
  approval_pda: z.string().regex(PUBKEY, "approval_pda must be a base58 Solana pubkey"),
  timeout_ms: z.number().int().min(1000).max(60000).optional(),
});
export type SignRequestBody = z.infer<typeof SignRequestSchema>;

/**
 * Schema for `GET /api/crosschain/cards?pubkey=<...>` query.
 */
export const CardsQuerySchema = z.object({
  pubkey: z.string().regex(PUBKEY, "pubkey must be a base58 Solana pubkey"),
});
export type CardsQuery = z.infer<typeof CardsQuerySchema>;

/**
 * Validate raw input. Returns either { ok: true, data } or { ok: false, errors }.
 *
 * Route handlers prefer this surface over throwing because they want to
 * return clean 400 JSON responses rather than 500-from-uncaught-throw.
 */
export function validateSignRequest(
  raw: unknown,
):
  | { ok: true; data: SignRequestBody }
  | { ok: false; errors: string[] } {
  const result = SignRequestSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => i.message),
  };
}

export function validateCardsQuery(
  raw: unknown,
):
  | { ok: true; data: CardsQuery }
  | { ok: false; errors: string[] } {
  const result = CardsQuerySchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => i.message),
  };
}
