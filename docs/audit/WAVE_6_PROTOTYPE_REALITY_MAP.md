# WAVE_6 Prototype-to-Reality Mapping

**Source of truth:**
- **UI/UX:** `C:\Users\prate\Downloads\setltlt protype\` (prototype, 24 screen JSX files)
- **Product truth:** real backend in this repo — Anchor program on devnet, Supabase, `/api/*`, 4 published SDK packages

**Rule:** Every prototype element gets one of these statuses against real backend:
- ✅ **shipped** — backend exists, surface it
- 🟡 **partial** — backend exists but UI/glue missing — finish + surface
- 🟠 **setup-required** — backend exists but user must opt in (e.g. claim handle, install SDK) — render with explicit "set up first" CTA, never fake the data
- 🔴 **planned** — backend doesn't exist yet — REMOVE from UI, file as Wave 7+
- ⚫ **demo-only** — only safe to show under explicit `?demo=1` flag against deployer wallet

This doc is the **contract**. Mapping decisions are locked. Implementation must follow this — no scope creep.

---

## Real backend inventory (what we can actually surface)

### Anchor program (devnet, slot 459525733)
- 15 instructions: `create_card`, `revoke_card`, `update_card_caps`, `add_allowlist_entry`, `remove_allowlist_entry`, `open_pact`, `close_pact`, `spend_via_pact`, `record_denial`, `record_receipt`, `open_streaming_pact`, `claim_streaming`, `open_delivery_escrow`, `release_escrow`, `dispute_escrow`
- 13 events emitted on chain
- Deployed program ID: `HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD`

### Supabase tables (live data)
- **agent_cards** — programmable spending cards (label, daily_cap_lamports, used_today, revoked, authority_pubkey, agent_pubkey)
- **agent_card_allowlist** — per-card capability/merchant allowlist
- **pacts** — OneShot/Streaming/DeliveryEscrow open transactions (parent_card, mode, used_lamports, max_total_lamports, expiry_slot, closed)
- **receipts** — every payment with 4-hash kernel commit (request_id, decision ALLOW|DENY|REVIEW, deny_code, capability_hash, receipt_kind, amount_lamports, merchant_pubkey, card_pubkey)
- **policy_decisions** — decision log per receipt
- **handles** — claimed user handles
- **verified_merchants** — DNS-verified merchant directory
- **capability_registry** — capability_hash → human alias
- **merchant_pricelist** — per-merchant capability pricing
- **payment_links** — `/pay/[token]` shareable links
- **kernel_receipt_attestations** — additional receipt-kernel commitments
- **receipt_tags** — per-tagger private tags
- **agent_trust_scores** — public reputation
- **scheduled_sends** — recurring sends (rent etc.)
- **save_for_buckets** — savings goals
- **allowances** — kid/recipient allowances
- **group_accounts**, **group_account_members**, **group_spend_requests**, **group_spend_approvals** — N-of-M spending
- **collabs**, **split_bills**, **split_bill_payments** — co-pay flows
- **federated_receipts**, **federation_origins** — cross-instance receipts
- **phase5_executions** — cron tick log (operator surface)
- **auto_refill_rules**, **auto_refill_queue**, **round_up_rules**, **round_up_queue** — automation
- **gift_sends** — gift flow
- **fraud_flags** — risk signals (operator)
- **idempotency_keys**, **nonce_cache** — replay protection (server-only)
- **reputation_badges** — soulbound MPL Core badges
- **refund_requests** — refund flow
- **follows** — social follow graph
- **push_subscriptions** — web push for notifications
- **agent_templates** — AgentCard preset library
- **waitlist** — landing email capture (Wave 6.1)

### Published packages (real public artifacts)
- `settle-protocol-sdk` (PyPI v0.2.0): `verify_receipt`, `kernel_commit`, LangChain + CrewAI adapters
- `create-settle-merchant` (npm): scaffolds keypair + capability + .env
- `@settle-web/web-components` (npm): `<settle-pay>`, `<settle-verify>`
- `@settle/mcp-middleware` (workspace): MCP wrap + 4 framework adapters (TS-side OpenAI/Anthropic/LangChain.js/CrewAI.js)

### Real /api/* endpoints (~50, deployed)
Among them: `dashboard/v6`, `balance`, `stats/landing`, `waitlist`, `receipts/[id]`, `search/receipts`, `cards/[id]`, `groups/*`, `exports/receipts`, `capabilities/discover`, `x402/proxy/[merchant]`, `send/build`, `resolve`, `at/[handle]`, `m/[handle]/*`, `embed/pay`, `verify-build`

---

## Per-screen mapping

Format: **Prototype** → **Real route** → **Backend** → **Status** → **Show** / **Hide**

### A. Public marketing surface

| Prototype | Real route | Backend | Status | Show / Hide |
|---|---|---|---|---|
| `screen-landing.jsx` hero | `/` | n/a (static) | ✅ shipped | Show: hero, request-access form (writes to `waitlist` table). |
| `screen-landing.jsx` stats strip ($1.04M / 400ms / 18) | `/` strip | `/api/stats/landing` (real receipts query, presentability gate) | ✅ shipped | Show: only when `is_presentable=true`. **Hide entirely** when devnet volume < $1K. **No fake numbers.** |
| `screen-landing.jsx` AgentCard demo (code block) | `/` right column | static example, no live wiring | ✅ shipped | Show: code is documentation, not live state. Label as "Example" implicitly via "Live" pill being decorative. |
| `screen-landing.jsx` 4 product cards (AgentCard/Receipts/Rules/Pacts) | `/` product surface | n/a (marketing) | ✅ shipped | Show: keep — every card maps to a real product surface. |
| `screen-landing.jsx` 6-audience grid | `/` audience | links to `/?surface=...` | ✅ shipped | Show: keep. Routing wired. |
| `screen-landing.jsx` For Builders code (`settle-sdk`) | `/` builders strip | real SDK shipped on PyPI/npm | ✅ shipped | Show: keep, link to actual `/docs` + GitHub repo. |
| `screen-landing.jsx` Trust quotes (3 quotes) | `/` trust layer | n/a (marketing copy) | ✅ shipped | Show: keep. Quotes describe real behaviors. |
| `/brand` | new | static | ✅ shipped | Logo download, color tokens, type scale. |
| `/changelog` | new | hand-curated MDX | ✅ shipped | Real shipped events only. |
| `/privacy`, `/terms` | new | static | ✅ shipped | Plain-English commitments — no claims we don't honor. |
| Footer email + "Stats" link | `/` + `/stats` | real | ✅ shipped | Keep. |

### B. Consumer surface

| Prototype | Real route | Backend | Status | Show / Hide |
|---|---|---|---|---|
| `screen-c-home.jsx` Hero "Hi @aria" | `/dashboard` hero | `/api/handles/by-pubkey?pubkey=<>` | ✅ shipped | Show real handle. If null → "Welcome" (no fake). |
| Dark balance strip ($USDC + $SOL · cluster · "auto-refill ready") | `/dashboard` | `/api/balance` (Helius RPC) | ✅ shipped (USDC+SOL+cluster). 🟠 "auto-refill ready" requires `auto_refill_rules` row. | Show: real balance + cluster. Hide "auto-refill ready" string when no rule exists; show "auto-refill: on" only when active. |
| Today bento (spent / received / agents active) | `/dashboard` | `/api/dashboard/v6` (real SQL on receipts + agent_cards) | ✅ shipped | Show real numbers. Empty state: "Nothing today yet." |
| Agents on duty (3 cards: Creator tips, Studio card, Work card) | `/dashboard` | `/api/dashboard/v6.agents_on_duty` (top-3 agent_cards by spend today) | ✅ shipped | Show real cards. **Empty:** "No agents yet. Hire your first agent →" — no fake cards. |
| Recent receipts table | `/dashboard` | `/api/dashboard/v6.recent_receipts` | ✅ shipped | Show real receipts. Each row links to `/receipts/[id]`. **Empty:** CTA to `/send`. |
| Active Pacts (3 cards: Studio research, Monday renders, Research stream) | `/dashboard` | `/api/dashboard/v6.active_pacts` (open pacts join card label) | ✅ shipped | Show real pacts. **Empty:** "Open a Pact →" |
| Coming up (Rent monthly, Lila's allowance weekly) | `/dashboard` | `/api/dashboard/v6.coming_up` (`scheduled_sends` + `allowances`) | ✅ shipped | Show real upcoming. **Empty:** "Nothing scheduled." |
| Saving toward (✈️ Tokyo trip, 🛟 Emergency fund) | `/dashboard` | `/api/dashboard/v6.savings` (`save_for_buckets`) | ✅ shipped | Show real goals. **Empty:** "No savings goals." |
| 4-hash protocol footer | `/dashboard` | n/a (educational) | ✅ shipped | Keep — describes real on-chain commitments. |
| `screen-c-send.jsx` recipient/amount/note | `/send` | `/api/send/build` + wallet adapter | ✅ shipped | Show. Existing logic preserved, prototype-styled chrome. |
| Send token picker (USDC + Jupiter swap) | `/send` | `/api/swap/quote-and-build` (mainnet only) | ✅ shipped | Show. Devnet shows "swap is mainnet only" gate (already in code). |
| `screen-c-receipts.jsx` filterable list | `/ledger` | `/api/ledger` + `/api/search/receipts` | ✅ shipped | Show. **Empty:** "No receipts yet → Send to anyone" |
| `screen-c-pacts.jsx` Pact list | `/cards` | `/api/cards/list` (existing) | ✅ shipped | Show. |
| `screen-c-other.jsx` Groups | `/groups` | `/api/group-accounts` + group RLS (fixed Wave 5) | ✅ shipped | Show. |
| `screen-c-other.jsx` Savings | `/wishes` | `save_for_buckets` table | ✅ shipped | Show. |
| `screen-c-other.jsx` Schedule | `/allowances` | `scheduled_sends` + `allowances` | ✅ shipped | Show. |
| `screen-c-other.jsx` Profile | `/at/[handle]` | `/api/at/[handle]` | ✅ shipped | Show. |
| `screen-c-other.jsx` Notifications (3 unread) | `/activity` | Supabase Realtime on `policy_decisions` + `push_subscriptions` | 🟡 partial | Show real activity feed (works). Hide unread badge until web-push count is wired (TODO Wave 7). For now show count only when `push_subscriptions` row exists. |
| `screen-c-other.jsx` Settings | `/settings` | existing | ✅ shipped | Show. |
| Receipt detail (4-hash chain anim, decision, tags, refund timer) | `/receipts/[requestId]` | `/api/receipts/[id]`, `/api/receipts/[id]/tags`, refund flow | ✅ shipped | Show — frost-shatter, hash-chain, tags all real. |

### C. Agent surface

| Prototype | Real route | Backend | Status | Show / Hide |
|---|---|---|---|---|
| `screen-agents.jsx` Overview ("4 active, $54.27 today, denial 6%") | `/agents` | `/api/agents/overview` (NEW — to be built) | 🟡 partial | Build endpoint same shape as `/api/dashboard/v6` but agent-framed. **Empty:** "Hire your first agent" CTA. |
| Hire form (template picker → AgentCard create) | `/agents` | wallet adapter + `agent_cards` insert | ✅ shipped | Show. Template list from `agent_templates` table. **Empty templates:** "Templates load when curated; build from scratch →" |
| `screen-agent.jsx` AgentCard detail | `/cards/[id]` | `/api/cards/[id]` | ✅ shipped | Show — already wired. |
| `screen-policies.jsx` Caps & rules editor | `/cards/[id]?tab=policy` | `update_card_caps` Anchor ix | ✅ shipped | Show as tab. |
| Decisions feed | `/audit` | `policy_decisions` realtime | ✅ shipped | Show. **Empty:** "No decisions yet." |
| Hire-Blink (Solana Action) | `/blink` | `/api/actions/hire/[slug]` | ✅ shipped | Show shareable link. |

### D. Merchant surface

| Prototype | Real route | Backend | Status | Show / Hide |
|---|---|---|---|---|
| `screen-merchant.jsx` Overview (revenue today/30d, disputes) | `/m/[handle]/manage` | `/api/m/[handle]/overview` (NEW — to be built) | 🟡 partial | Build endpoint. **Empty merchant (no handle):** route to `/m/[handle]/manage?setup=1` claim wizard. |
| Public profile | `/m/[handle]` | `/api/at/[handle]` (handles dual-role) | ✅ shipped | Show. |
| Capabilities | `/m/[handle]/capabilities` | `merchant_pricelist` + `capability_registry` | ✅ shipped | Show. **Empty:** "Add a capability to accept payments." |
| QR & links | `/m/[handle]/qr` (new aggregator) + `/qr/[merchant]/[slug]` | `payment_links` table | ✅ shipped + 🟡 aggregator | Show single QR pages exist; aggregator at `/m/[handle]/qr` to be built (lists all payment_links). |
| Disputes | `/m/[handle]/disputes` | `refund_requests` | ✅ shipped | Show. |
| Webhooks | `/m/[handle]/webhook` | `webhook_delivery_status` on `receipts` table + admin retry | ✅ shipped | Show. |
| DNS verify | `/m/[handle]/verify` | `verified_merchants` + `domain_verification_tokens` | ✅ shipped | Show. |
| Analytics | `/m/[handle]/analytics` | aggregations from `receipts` (existing) | ✅ shipped | Show. |
| Onboarding wizard (claim handle + DNS verify + first capability) | `/m/me/manage?setup=1` (NEW) | existing endpoints | 🟡 partial | Build wizard: claim handle → register first capability_hash → optional DNS verify. |

### E. Developer surface

| Prototype | Real route | Backend | Status | Show / Hide |
|---|---|---|---|---|
| Docs hub | `/docs` | static MDX (current stub) | 🟡 partial | Expand: real SDK, MCP, webhooks, embed components. **Verify each link points to actual doc.** |
| SDKs | `/docs/sdks` (NEW) | `settle-protocol-sdk` PyPI, `@settle-web/web-components` npm, `@settle/mcp-middleware` workspace | 🟡 partial | Build page: 3 install snippets, all real. |
| MCP middleware | `/docs/mcp` | `@settle/mcp-middleware` (real workspace) | 🟡 partial | Expand existing stub with `wrapWithSettle` + agent-adapter snippets. |
| Pay component embed | `/docs/pay-component` | `@settle-web/web-components` `<settle-pay>` | ✅ shipped | Show real install + live `<settle-pay>` iframe demo (using `/embed/pay`). |
| Verify component embed | `/docs/verify-component` | `@settle-web/web-components` `<settle-verify>` | ✅ shipped | Show. |
| Webhooks docs | `/docs/webhooks` | `webhook_delivery_status` schema + signing secret | 🟡 partial | Expand: HMAC signature verification snippet, retry behavior, payload shape. |
| API explorer | `/docs/api` (NEW) | OpenAPI generated from real `/api/*` routes | 🔴 planned | **Hide** until OpenAPI spec generated. Wave 7+. |
| Sandbox | `/sandbox` | airdrop + USDC mint on devnet | ✅ shipped | Show. |

### F. Operator surface

| Prototype | Real route | Backend | Status | Show / Hide |
|---|---|---|---|---|
| Health | `/control-center` | `/api/operator/health` (NEW) — cron tick from `phase5_executions`, indexer cursor, RPC ping, federation peer count | 🟡 partial | Build endpoint with `SETTLE_INTERNAL_API_KEY` auth. **Public users:** redacted view (just cluster + indexer health). |
| Cron | `/admin` | `phase5_executions` table | ✅ shipped (admin) | Show with auth gate. |
| Federation | `/admin` (sub-section) | `federation_origins` + `federated_receipts` | ✅ shipped | Show. |
| Preflight | `/admin` (sub-section) | `/api/preflight` existing | ✅ shipped | Show. |
| Verify build | `/verify-build` | `/api/verify-build` existing | ✅ shipped | Show — real on-chain program hash. |

### G. Public surface

| Prototype | Real route | Backend | Status | Show / Hide |
|---|---|---|---|---|
| `screen-verifier.jsx` Walletless verifier | `/verify` + `/verify/[hash]` | `/api/receipts/[id]` + client-side BLAKE3 (existing) | ✅ shipped | Show. |
| `screen-capability-heatmap.jsx` Live grid | `/leaderboard` | Supabase Realtime on `receipts` (existing) | ✅ shipped | Show. **Empty grid:** "Capabilities will appear as agents spend." |
| Capabilities directory | `/capabilities/discover` | `/api/capabilities/discover` (NIM-ranked) | ✅ shipped | Show. |
| Federation peers | `/leaderboard` (current — dedicated page TBD) | `federation_origins` | 🟡 partial | Add small federation panel under leaderboard. |
| Stats | `/stats` | `/api/stats/network` (NEW — extend existing endpoint) | 🟡 partial | Build endpoint. **Empty network:** "No activity yet on devnet." |
| Public feed | `/feed` | `receipts` where `public_feed=true` | ✅ shipped | Show. |
| Public profile (`@handle`) | `/at/[handle]` | `/api/at/[handle]` | ✅ shipped | Show. |
| Public proof page | `/at/[handle]/proof` | reputation + capability history | ✅ shipped | Show. |

---

## What the prototype shows but our backend does NOT support yet

These get **REMOVED** from the redesign. Tracked for Wave 7+.

| Prototype claim | Reason removed |
|---|---|
| AgentCard "Trust 87 · 142 followers" badge in sidebar | We have `agent_trust_scores` + `follows` tables. Surface real numbers when wallet connected. **DON'T fake "87 / 142".** Show "—" or hide line until populated. |
| "auto-refill ready" string on balance strip | Only show when an `auto_refill_rules` row exists for this wallet. |
| Notifications "3" badge | Only show when `push_subscriptions` row exists + has unread events. |
| Federation peer-list page (separate UI) | We have data; no dedicated route yet. **Plan:** Wave 7 add `/federation`. For Wave 6 surface inside `/leaderboard`. |
| `/docs/api` OpenAPI explorer | OpenAPI spec not generated yet. **Wave 7.** |
| Sealed-memo voice notes UI on receipt detail | Backend partial (`encrypted_metadata` in schema, sealed-box exists). UI was started. **Status:** finish in Wave 7 — for Wave 6 hide the voice icon when no encrypted_metadata present. |
| In-app PUSH notification toast on new receipt | We have `push_subscriptions` table but no in-app toast wiring. **Wave 7.** |
| Agent template marketplace ("Studio research" preset etc.) | Backend `agent_templates` table exists. **For Wave 6 surface a curated 3-template list** seeded by us. **No fake user-submitted templates.** |
| Card "frost-shatter" on revoke + Pact "kill chain" sequence | Already shipped in `@settle/ui` (PactCard). Keep — real animation. |
| Public verifier showing "external CDN-style" branding | Don't claim mainstream usage we haven't earned. Render the verifier honestly. |

---

## What our backend supports but the prototype MISSED

These get **ADDED** in the redesign using prototype design language.

| Real Settle feature | Where to surface | Why prototype missed |
|---|---|---|
| `/blink` Solana Action — shareable hire link | Agent surface home + share button on AgentCard detail | Prototype assumed wallet-only flow. |
| `/import` (import existing on-chain receipts via cnft) | Consumer surface (Money section) | Settle-native + federation are shipped; prototype only shows native. |
| `/split-bill/[id]` co-pay flows | Consumer surface (under Send) | Prototype's send is single-recipient; we have group co-pay. |
| `/collab/*` collab payment links | Consumer + merchant | Prototype doesn't show. |
| `/onboarding` 4-step wizard (connect → fund → create card → first send) | Standalone — auto-redirect first connect | Prototype assumes onboarded user. |
| `/verify/[hash]` direct walletless verify with hash in URL | Public verifier deep-link | Prototype shows form-only verify. |
| Webhook delivery health on merchant overview | Merchant surface | Prototype lists webhooks but doesn't show delivery status. We have `webhook_delivery_status` enum. |
| ZK Receipt (compressed NFT) "private receipt" mode | Receipt detail toggle | Real backend supports Light Protocol + Bubblegum cNFT. Prototype shows public-only. |
| Federation cross-instance receipt verification | `/at/[handle]/proof` + receipt detail | Real `federated_receipts` + `federation_origins` exist. Prototype is single-instance. |
| Trust score formula explainer | `/at/[handle]/proof` | We have the formula; prototype shows a number without explaining how it's computed. |
| Receipt tags (private per-tagger) | Receipt detail | Already shipped in Wave 1. Prototype doesn't show this. |
| `/settings/exports` compliance receipt export (CSV/PDF/JSON + jurisdiction) | Settings | Already shipped Wave 1. Prototype doesn't show. |

---

## Visual rules carried over (confirmed from prototype)

1. Light app background `#FDFDFD`
2. Light sidebar same bg, 232px wide, sticky
3. Active nav item: dark zinc `var(--w6-rule-2)` background + zinc text (NOT inverted black-on-white as I had in some places — match prototype exactly)
4. Topbar 64px sticky, `rgba(253,253,253,0.85)` + backdrop-blur
5. Surface switcher pills: 6 pills, active = black bg + white text, animated layoutId
6. Cluster badge: amber dot static for devnet, emerald pulse for mainnet
7. Bento card: white gradient bg + 24px radius + zinc-200 border
8. Dark strip card (balance): `#09090b` bg + white text
9. Mobile: bottom-tab replaces sidebar at <768px, NEVER on desktop
10. Outfit (heading), Inter (sans), JetBrains Mono (mono)
11. No debug outlines, no white-on-white, no orange placeholders, no `data-om-id`

---

## Implementation order (after this map is approved)

**Wave 6.A — fix the cascade bug** (already in flight)
- Move `body[data-w6]` to higher specificity in @layer utilities ✅
- Verify dashboard renders dark text on light bg
- Re-baseline visual regression

**Wave 6.B — port the actual prototype layouts**
For each consumer screen, replace the wrapped-but-unstyled inner content with the prototype's bento layout, wired to real `/api/*`:
- `/dashboard` — already done (Wave 6.2)
- `/send` — wrapped, needs prototype-spec inner layout (tabs for handle/pubkey/link/QR)
- `/ledger` — wrapped, needs prototype's source-grouped feed (native_kernel / native_imported / federated_trusted / federated_untrusted)
- `/cards` — wrapped, needs prototype's pact-card grid layout
- `/cards/[id]` — wrapped, needs prototype's per-pact detail (decision history, capability allowlist chips, slide-to-revoke)
- `/groups`, `/wishes`, `/allowances`, `/activity`, `/settings` — wrapped, need internals reworked
- `/at/[handle]` + `/at/[handle]/proof` — wrapped, need prototype's profile layout
- `/onboarding` — wrapped, needs 4-step wizard layout
- `/agents` — wrapped, needs prototype's agent-overview bento

**Wave 6.C — agent + merchant + developer + operator + public surfaces**
- Build `/api/agents/overview`, `/api/m/[handle]/overview`, `/api/operator/health`
- Build merchant claim wizard at `/m/me/manage?setup=1`
- Reskin all merchant subpages
- Reskin all dev docs subpages with real SDK content

**Wave 6.D — add what prototype missed**
- Surface `/blink`, `/import`, `/split-bill/*`, `/collab/*` in consumer
- Add ZK receipt mode toggle to receipt detail
- Add federation panel to `/leaderboard`
- Add trust score explainer to `/at/[handle]/proof`

**Wave 6.E — final review + sign-off**
- Side-by-side prototype-vs-live screenshot every screen
- Verify zero fake data anywhere
- Empty/loading/error/setup-required state per screen
- Mobile pass at 390px
- a11y contrast 4.5:1 audit
- Visual regression baselines locked
- 77+ E2E green

---

## Status (as of 2026-05-02)

**Wave 6.A** ✅ shipped — cascade fix verified by `e2e/w6-cascade-audit.spec.ts` (8/8 passing). Body color, sidebar bg, balance strip, active nav all read correct computed styles. Bottom-tab `md:hidden` fixed (inline `display:flex` was overriding the class — moved into className).

**Wave 6.B** ✅ shipped — consumer surface ports:
- `/ledger` rewritten with W6 hero, count-pill filter strip, source-grouped sections (`w6-card`), hash-mark for kernel-anchored rows, decision pills, real `/api/ledger` data with empty/error states
- `/cards` got W6 hero + quick actions, count strip, w6-card empty/loading
- `/activity` got W6 hero + Live pill, w6-card empty CTA, real Supabase Realtime preserved
- `/groups`, `/wishes`, `/allowances`, `/settings` all got the consistent W6 hero pattern
- `/at/[handle]`, `/receipts/[requestId]`, `/dashboard`, `/send` were already W6-polished

**Wave 6.C** ✅ shipped (consumer-adjacent):
- `/agents` got W6 hero
- `/m/[handle]` (public merchant profile) fully reskinned to W6 cards, stat grid, embed snippets, trust score color-coded
- Header hide-list extended to cover `/m`

**Wave 6.D** ✅ phase 1 shipped:
- `/import` and `/split-bill` reskinned with W6AppShell + hero pattern
- Sidebar nav got new "Tools" section: Import receipt, Split bill, Share via Blink

**E2E status**: 85/85 chromium passing (full suite). 8/8 cascade audit. 27/27 visual baselines locked. 14/14 nav-smoke.

---

## What I'm NOT going to do unless you say so

- Fake any number, badge, capability, or merchant
- Add a `/blog` (no content yet)
- Build the API explorer until OpenAPI spec exists
- Add features that depend on mainnet (audit, real-money flows)
- Mock data anywhere except explicit `?demo=1` showing the deployer wallet

---

## Approve this map — then I implement

**Reply with:**
- 👍 Approve as-is
- ✏️ Edit specific rows (cite the row)
- ➖ Remove a screen entirely
- ➕ Add a backend feature I missed

Once you approve I start with **Wave 6.A** (cascade fix verification + visual regen) and proceed wave-by-wave per the order above. Each wave ends with full E2E green + screenshots.
