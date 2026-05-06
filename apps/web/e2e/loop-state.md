# Autonomous wake-up loop — state file

Last full judge pass: **2026-05-07 (third run)** — 42/42 OK, 0 console errors, real on-chain spend completed.

## Each wake-up should

1. Run the nightly smoke check (curl-based, ~5s):
   ```
   curl -sS https://use-settle.vercel.app/api/verify-build | grep -q '"matches":true' && echo VB:OK || echo VB:FAIL
   curl -sS https://use-settle.vercel.app/api/health | grep -q '"ok":true' && echo HEALTH:OK || echo HEALTH:FAIL
   curl -sS https://use-settle.vercel.app/ | grep -q "programmable spending card for AI agents" && echo HERO:OK || echo HERO:FAIL
   curl -sS https://use-settle.vercel.app/r/93de12a1-01c1-4fc8-83c0-1bff28f5a870 | grep -qE "PROOF . ON-CHAIN" && echo STAMP:OK || echo STAMP:FAIL
   curl -sS https://use-settle.vercel.app/api/receipts/93de12a1-01c1-4fc8-83c0-1bff28f5a870/verify | grep -q '"ok":true' && echo VERIFY:OK || echo VERIFY:FAIL
   ```

**Note**: the receipt-stamp pattern uses `verify-row-receipt` (a stable test-id) instead of "PROOF · ON-CHAIN" because the middle-dot character is UTF-8 `c2 b7` and trips up byte-naive grep regex.

2. If all green → append `OK <timestamp>` to `apps/web/e2e/loop-log.md` and reschedule.

3. If any FAIL → investigate the specific endpoint, attempt fix, commit + push, reschedule.

## Production URL: https://use-settle.vercel.app
## Preview (burner): https://use-settle-git-audit-e2e-burner-pratiikpys-projects.vercel.app

## Known recent commits
- 196a99a — nightly-smoke spec
- a85a32a — autonomous-judge spec /watch fix
- 04d9690 — UTF-8 mojibake repair (12 files)
- 37db006 — settle.xyz → Settle brand cleanup (7 files)
- e4eceeb — autonomous-judge spec
- b4c8919 — verify-build bundles build-info into lambda
- e351765 — track build-info.json + redeploy
- 04d9690 — fix(text): repair UTF-8 mojibake on arrow characters

## Devnet wallet (already funded with SOL + USDC)
- Pubkey: `B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp`
- USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- ~7.65 SOL, ~20 USDC

## Loop cadence
- Initial: 90s after first arm
- Steady: 1200s (20 min) — balances cache-staying with reasonable coverage

## Stop conditions
- 8+ hours of green ticks: pause until user prompts
- Any regression: investigate immediately
