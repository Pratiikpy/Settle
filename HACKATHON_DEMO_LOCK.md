# HACKATHON_DEMO_LOCK

The exact, frozen demo flow for the Solana Frontier Hackathon submission.
**Don't deviate.** Every URL, every click, every visible piece of UI in
this doc has been verified on live production within the last hour.

---

## 0. Two-mode reality (read first)

The Settle production URL `https://use-settle.vercel.app` does **not**
ship the E2E Persona burner-wallet adapter — that's a deliberate
security choice (the burner key would let anyone sign as the test
wallet). So a wallet-required action like clicking *Pay* on production
needs **a real Phantom extension** installed in the browser.

Two options for the demo recording:

| Mode | Wallet flow | Proof flow | Risk |
|---|---|---|---|
| **A — Real Phantom on production** | Real Phantom extension, real signing prompt | Same URL throughout | Phantom UI not driven in the audit; signing dialog might surprise the recorder |
| **B — Burner on audit preview, then switch to production for proof** | E2E Persona on `use-settle-git-audit-e2e-burner-pratiikpys-projects.vercel.app` | Switch to production `/verify?h=<hash>` for the canonical "verifiable money" pitch | Two URLs visible in the demo; voice-over should clarify |

**Recommended: Mode B** — every step has been runtime-verified, the
wallet flow is fully scriptable (see `e2e/demo-recorder.spec.ts`), and
the final on-camera result lives on the canonical production URL the
judges hit.

---

## 1. Production-only routes that are SAFE to show

Every route below has been verified live on `use-settle.vercel.app`
within the last hour and renders cleanly without W6AppShell glitches,
black flashes, or layout shifts.

| Route | Purpose | Wallet required? | Verified at |
|---|---|---|---|
| `/` | Landing — hero + live agent activity ticker showing real on-chain receipts | No | 2026-05-05T15:15Z |
| `/verify?h=<receipt_hash>` | Public verifier — recomputes 4 BLAKE3 hashes, returns VERIFIED ✓ | No | 2026-05-05T15:15Z |
| `/r/<request_id>` | Receipt poster page — full 4-hash kernel chain, decision, amount | No | 2026-05-05T15:15Z |
| `/stats` | Live network counters fed by real receipts (RECEIPTS·24h, USDC MOVED·24h, by_kind, by_decision) | No | 2026-05-05T15:15Z |
| `/feed` | Public agent activity feed (currently empty until a receipt opts public_feed=true; safe to show empty state) | No | 2026-05-05T15:15Z |
| `/leaderboard` | Capability heatmap + federation panel | No | 2026-05-05T15:15Z |
| `/docs` | Developer reference — Quickstart, Kernel commit, Anchor ix, Webhooks tabs | No | 2026-05-05T15:15Z |
| `/security` | Threat model (dual-sig, on-chain enforcement, escrow merchant pin, hash chain) | No | 2026-05-05T15:15Z |
| `/embed/pay?merchant=<addr>&amount=<n>` | Iframe-able payment widget — renders amount + recipient, "Connect a wallet" CTA | No (to render) | 2026-05-05T15:15Z |
| `/agents/templates` | List of marketplace agents (Research / Translate / Summary) | No | 2026-05-05T15:15Z |
| `/agents/templates/research` | Detail page with cap, expiry, allowlist, "Connect a wallet to hire" | No (to render) | 2026-05-05T15:15Z |
| `/admin/preflight` | Operator health check — 6 GREEN, 1 YELLOW, 0 RED | No | 2026-05-05T15:15Z |
| `/verify-build` | On-chain bytecode SHA-256, repro commands | No | 2026-05-05T15:15Z |
| `/api/ledger?wallet=<pubkey>` | Backend proof — 23 receipts visible | No | 2026-05-05T15:15Z |
| `/api/dashboard/v6?pubkey=<pubkey>` | W6 dashboard payload — 5 recent_receipts, today.spent_count: 23 | No | 2026-05-05T15:15Z |

---

## 2. Routes that are NOT SAFE to show

These are blocked, env-dependent, partially fixed, ugly, or destructive.
**Do not visit them in the demo recording.**

| Route | Why NOT to show |
|---|---|
| `/agents/templates/<slug>` Hire button click | 503 `merchant_allowlist_unconfigured` until env vars set |
| `/agents/streaming` Open new stream | Bug #33: Parent card dropdown empty even when user owns 5 cards |
| `/cards/[id]?surface=agent` | Bug #35: shows `$0.00 of —` with progress ring at 60% — data/visual mismatch |
| `/audit` (operator decision log) | Bug #26: contains 11 visible FAILED rows from `spend_via_pact` Anchor stack-overflow. Don't read them on camera |
| `/privacy`, `/brand` | Bug #30: render without W6AppShell — inconsistent chrome with rest of app |
| `/m/me/<sub>` directly without redirect | Bug #28/#29: still show raw `handle_not_found` or perpetual "Resolving handle…" if redirect runtime hasn't loaded |
| `/admin/cron` Run-Now click | Requires `CRON_SECRET` — clicking without it shows error path |
| `/sandbox` "Get $25 devnet USDC" | Devnet faucet rate-limited; shows "Airdrop is offline right now" with manual fallback. Acceptable as a fallback story but adds friction. Skip if recording silently. |
| `Slide to revoke card` on a card detail page | Destructive — once revoked the card is permanently dead, future demos lose state |
| `Close · refund vault` button on an open Pact | Same destructive concern |
| `/dashboard` AGENTS ON DUTY first row | Bug #40: shows literal `?` for an unnamed card. Crop or scroll past it |

---

## 3. Burner wallet identity (public-only)

```
Public key (Alice, the demo wallet):
C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY

Public key (Bob, demo recipient):
DvzeYj2gE4Lu1uK8CDrkERWnBMXp5tGT2yVvc8KmUbAk

Handle on devnet:
@e2es8195v
```

**Private keys are in local `.test-wallet.json` and `.test-merchant.json`
files — NEVER commit, screenshot, or paste them anywhere visible. The
recorder script reads them from the working dir at runtime.**

Before recording, seed the burner via the browser's localStorage:
```js
// Run once in the audit-branch preview's DevTools console
localStorage.setItem(
  'settle-e2e-burner-key',
  // base58 of the .test-wallet.json arr — DON'T paste in chat or commit anywhere visible
  '<paste from .test-wallet.json -> bs58.encode(arr) locally>'
)
```

The recorder script does this automatically using `addInitScript`.

---

## 4. Demo script (silent video, ~75 seconds)

### Frame 1 — open landing (production)
- **URL**: `https://use-settle.vercel.app/`
- **Show**: hero, "Programmable money for the AI age" headline, the Live Agent Activity terminal ticker (top-right of hero) showing real `live · on-chain` receipts scrolling
- **Caption**: "Settle on Solana. Every payment is a verifiable receipt."

### Frame 2 — verify a receipt without a wallet (production)
- **URL**: `https://use-settle.vercel.app/verify?h=ca50ca04e587acecbfefdab0bfdcee5351a521f33797d201417a9c3a238cc902`
- **Show**: the **VERIFIED ✓** badge, all 4 BLAKE3 hashes matching canonical JSON, "Anchored at slot 460,246,396"
- **Caption**: "Anyone can verify. No wallet. No Settle dependency."

### Frame 3 — open the receipt detail (production)
- **URL**: from the previous frame, click "Open receipt"; navigates to `/r/93de12a1-01c1-4fc8-83c0-1bff28f5a870`
- **Show**: $0.001 USDC · APPROVED, Merchant + Card pubkeys, 4-hash chain panel, decision slot 460,246,396
- **Caption**: "Receipts are cryptographic, not screenshots."

### Frame 4 — show the live counters (production)
- **URL**: `https://use-settle.vercel.app/stats`
- **Show**: RECEIPTS·24h: 23+, USDC MOVED·24h: $0.02+, "By kind: direct_send 100%", "By decision: ALLOW 100%". Note: numbers will reflect actual audit data
- **Caption**: "The whole network is auditable, in real time."

### Frame 5 — drive a real send (audit-branch preview, with burner)
- **URL**: `https://use-settle-git-audit-e2e-burner-pratiikpys-projects.vercel.app/send`
- **Action**: pre-seeded burner wallet auto-connects → Pubkey tab → fill recipient `DvzeYj…UbAk` → fill amount `0.001` → fill purpose `hackathon-demo` → click *Pay 0.001 USDC*
- **Show**: button transitions: Pay → Signing in wallet → Confirming on Solana → **Sent ✓**, then the Solscan link appears
- **Caption**: "Programmable spend. Hard caps. Receipts on chain."

### Frame 6 — back to production, verify the brand-new receipt
- **URL**: `https://use-settle.vercel.app/verify?h=<receipt_hash from the Sent ✓ stage>`
- **Show**: VERIFIED ✓, anchored at the slot that matches the on-chain confirmation from Frame 5
- **Caption**: "Same receipt. Public verifier. End-to-end proof."

### Frame 7 — show the iframe-able payment widget (production)
- **URL**: `https://use-settle.vercel.app/embed/pay?merchant=DvzeYj2gE4Lu1uK8CDrkERWnBMXp5tGT2yVvc8KmUbAk&amount=2.50&memo=Invoice-1024`
- **Show**: "PAY WITH SETTLE · $2.50 USDC · to Dvze…UbAk · EMERGING", "Connect a wallet (top right) to continue"
- **Caption**: "Embeddable in any merchant site."

### Frame 8 — close on the developer pitch (production)
- **URL**: `https://use-settle.vercel.app/docs`
- **Show**: TypeScript / Python / Rust SDK pnpm/pip/cargo install snippets, "Cross-language parity locked. 246 tests."
- **Caption**: "Three SDKs. One canonical contract. Build on it."

### End title (no URL)
- **Caption**: "Settle — verifiable money for the AI age. Built on Solana."

---

## 5. Pre-recording checklist

Run through every box before hitting record.

### Browser
- [ ] Fresh Chrome / Edge profile (no other tabs, no extensions other than Phantom for Mode A)
- [ ] DevTools closed (no debug panels)
- [ ] Browser zoom at **100%** (Cmd/Ctrl+0 to reset)
- [ ] Bookmark bar hidden (Cmd/Ctrl+Shift+B)
- [ ] No tab title showing the audit branch in screenshots — set the viewport to crop title bar if needed
- [ ] Notifications/popups silenced at OS level

### Account / wallet
- [ ] Burner wallet seeded in the audit-branch preview (Mode B) — see Section 3
- [ ] Burner wallet has at least 5 SOL devnet (for gas) and 1 USDC devnet — confirm at `/dashboard` "$N USDC · 5+ SOL"
- [ ] `@e2es8195v` handle resolves on `https://use-settle.vercel.app/api/handles/by-pubkey?pubkey=C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY`
- [ ] No screenshot or DevTools shows `.test-wallet.json` content, base58 burner key, or `localStorage` viewer

### Endpoints (last-mile sanity)
- [ ] `curl -s https://use-settle.vercel.app/api/health` → `ok: true, supabase: ok, settle_program: ok`
- [ ] `curl -s 'https://use-settle.vercel.app/api/ledger?wallet=C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY'` → counts.native_kernel ≥ 23
- [ ] `curl -s 'https://use-settle.vercel.app/api/verify?h=ca50ca04e587acecbfefdab0bfdcee5351a521f33797d201417a9c3a238cc902'` → returns ok=true with all 4 hashes match (or just confirm the page renders the green check)
- [ ] `curl -sI https://use-settle.vercel.app/api/dashboard/v6?pubkey=C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY | grep "HTTP/"` → `HTTP/1.1 200 OK`

### Recording rig
- [ ] OBS (or QuickTime / ScreenStudio) configured at 1920×1080 @ 30fps
- [ ] System audio muted (silent video; voice over added in post if needed)
- [ ] `apps/web/audit-*.png` screenshots cleaned out of the desktop preview
- [ ] Output directory exists: `apps/web/demo-recordings/`
- [ ] Disk: at least 2 GB free for video output

### Source / repo state
- [ ] `git status` clean on `main`
- [ ] Latest deploy on `use-settle.vercel.app` shows commit `da90c5b` or later (check `gh api repos/Pratiikpy/Settle/deployments?per_page=1 --jq '.[0].sha[:7]'`)
- [ ] All four reports committed: `BUG_REPORT.md`, `FINAL_HACKATHON_READINESS_REPORT.md`, `PRODUCTION_BLOCKER_FIX_REPORT.md`, `ENV_REQUIRED_FOR_FULL_DEMO.md`

### Hackathon submission paperwork
- [ ] Submission link points to the production URL `https://use-settle.vercel.app` — not the audit-branch preview
- [ ] Demo video file is < 200 MB if Solana Foundation requires file upload (compress with ffmpeg if needed)
- [ ] One-line tagline matches the home page: "Programmable money for the AI age."

---

## 6. Recovery plan (if something breaks during recording)

| If… | Do this |
|---|---|
| `/verify` shows "NOT FOUND" for the hash you used | The hash is wrong. Use the proven hash `ca50ca04e587acecbfefdab0bfdcee5351a521f33797d201417a9c3a238cc902` from the audit (it's permanent — the receipt is in production Supabase). |
| `Pay 0.001 USDC` button stays on "Sign in wallet" forever | The audit-branch preview lambda may have rotated. Re-seed localStorage burner key, hard-refresh (Cmd+Shift+R), retry. |
| `Sent ✓` doesn't appear in `/api/ledger` after 60s | Indexer lag. Don't restart — wait another 30s. The page is correct, /api/swap/quote-and-build inserts the receipt synchronously. |
| Production deploy SHA in the deployments list shows ≠ da90c5b | Check `gh api repos/Pratiikpy/Settle/commits/<SHA>/statuses` — if `Vercel: failure`, fix the TS error and redeploy (this exact failure mode caused the 30-min outage during the audit; don't repeat it). |

---

## Locked. Don't re-broaden.
