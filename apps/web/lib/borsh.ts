/**
 * AU-01-003 fix — borsh writer + ix data builder now live in
 * `packages/sdk/src/borsh.ts` so external SDK consumers don't need
 * apps/web internals to build Anchor ix data.
 *
 * This file is now a thin re-export shim — the canonical location is
 * `@settle/sdk`. Anything that historically imported from
 * `apps/web/lib/borsh` continues to work.
 */
export * from "@settle/sdk";
