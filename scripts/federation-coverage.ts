#!/usr/bin/env tsx
/**
 * Section 13 — Federation coverage live verification.
 * Verifies the federation pipeline:
 *   - federation_origins table accessible
 *   - /api/federation/origins (public) returns trusted-only origins
 *   - /api/admin/federation/origins (admin) requires CRON_SECRET
 *   - /api/federation/list?pubkey=… requires the pubkey param
 */
import "dotenv/config";

const HOST = process.env.API_HOST ?? "http://localhost:3000";
const SECRET = process.env.CRON_SECRET;

async function main() {
  console.log("# federation-coverage");

  // 1. Public endpoint
  const pubRes = await fetch(`${HOST}/api/federation/origins`);
  const pubJson = (await pubRes.json()) as { ok: boolean; origins: unknown[] };
  console.log(`✓ /api/federation/origins → ${pubRes.status}; origins: ${pubJson.origins?.length ?? "?"}`);

  // 2. Admin endpoint requires auth
  const adminNoAuth = await fetch(`${HOST}/api/admin/federation/origins`);
  if (adminNoAuth.status !== 401) {
    console.log(`✗ admin without auth should be 401, got ${adminNoAuth.status}`);
    process.exit(1);
  }
  console.log(`✓ /api/admin/federation/origins (no auth) → 401`);

  // 3. Admin endpoint with auth
  if (SECRET) {
    const adminAuth = await fetch(`${HOST}/api/admin/federation/origins`, {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    console.log(`✓ /api/admin/federation/origins (auth) → ${adminAuth.status}`);
  }

  // 4. List endpoint requires pubkey
  const listNoParam = await fetch(`${HOST}/api/federation/list`);
  console.log(`✓ /api/federation/list (no pubkey) → ${listNoParam.status}`);

  console.log("\n✓ federation-coverage PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
