# WAVE_6_PAGE_SPECS — per-page acceptance criteria

Format per page:
- **Route**, **Surface**, **Auth**
- **Hero / header section**
- **Body** (bento layout, exact cells, span)
- **Real-data sources** (linking to WAVE_6_DATA.md)
- **Empty / Loading / Error states**
- **Mobile (390px) breakpoint behavior**
- **A11y**
- **Animations** (linking to WAVE_6_MOTION.md)
- **Done when** (acceptance gate)

For pages not specified here, follow the **Generic Reskin Template** at the bottom — they're variations of the consumer pattern.

---

## 0. Chrome (sidebar + topbar + surface switcher) — applies to ALL authed pages

### Sidebar (left rail)
- **Width:** 232px desktop, hidden on mobile (replaced by bottom-tab on <768px)
- **Sticky** to viewport, scroll-overflow auto
- **Top:** Logo (mark + wordmark, 22px size)
- **Body:** nav sections per active surface (from `NAV_BY_SURFACE` in WAVE_6_REDESIGN_PLAN). Each nav-link has icon (16px) + label, active state = inset border-left `var(--ink)` + bg `var(--rule-2)`
- **Section labels:** `var(--ink-4)`, font-size 11px, uppercase, letter-spacing 1.2px, padding 18px 8px 8px
- **Footer card:** "You" — avatar + handle + trust-score chip — links to `/at/[handle]` (consumer) / `/m/[handle]` (merchant) / `/agents/[id]` (agent surface). When wallet not connected: "Connect to see profile" CTA.

### Topbar (sticky top, behind sidebar on desktop, full-width on mobile)
- **Height:** 64px desktop, 56px mobile
- **Background:** `rgba(253, 253, 253, 0.85)` + `backdrop-filter: blur(10px)` + bottom border `var(--rule)`
- **Z-index:** 10
- **Layout (desktop):** `[SurfaceSwitcher] [stretch] [ClusterBadge] [WalletButton]`
- **Layout (mobile):** `[Logo] [stretch] [WalletButton]` — surface switcher moves to a bottom sheet triggered by a "↗ surfaces" link in the sidebar drawer

### Surface Switcher
- 6 pills. Active = bg `var(--ink)`, text white. Inactive = transparent, text `var(--ink-3)`
- Stored in URL: `?surface=consumer|agent|merchant|developer|operator|public`
- Default = inferred from connected wallet (priority: merchant if owns a merchant_pubkey → agent if owns ≥1 agent_card → consumer otherwise → public if disconnected)
- **Switching to a surface the wallet doesn't qualify for** (e.g. consumer with no merchant profile clicks Merchant) → routes to a **claim/setup** page (not a broken dashboard). Specifics in WAVE_6_REDESIGN_PLAN.md surface-conflict section.

### Cluster Badge
- Reads `NEXT_PUBLIC_SOLANA_CLUSTER`. Devnet = amber dot, Mainnet = emerald dot.
- Click opens a popover with cluster info + RPC health + program ID. Read-only on devnet, no actual switching from UI (config-driven).

### Wallet Button
- Disconnected: "Connect wallet" — primary pill button, opens wallet-adapter modal.
- Connected: avatar + handle + truncated pubkey. Click → popover with Disconnect / Copy address / View on Solscan.

### Mobile bottom-tab (replaces sidebar <768px)
- 5 tabs max from active surface's primary section (e.g. consumer: Home / Send / Receipts / Pacts / More)
- "More" expands to full sidebar IA in a drawer

### A11y
- Sidebar: nav landmark, all links keyboard-tabbable, current page = `aria-current="page"`
- Topbar: SurfaceSwitcher = `role="tablist"`, each pill = `role="tab"` with `aria-selected`
- Cluster badge: `aria-label="Solana cluster: devnet"`
- Wallet button: when disconnected, `aria-label="Connect Solana wallet"`

### Animations (see WAVE_6_MOTION.md)
- Sidebar nav-link active: 140ms transition on bg + border
- Surface switcher pill: 140ms slide-from-prev (Framer LayoutGroup)
- Topbar wallet popover: 180ms fade + 8px translate-y

---

## 1. Landing — `/` (public)

**Surface:** Public. **Auth:** none. **Connected wallet?** Redirects to `/dashboard?surface=consumer` unless `?stay=1` query.

### Hero (top section, max-width 1280px, padding 64px 32px 32px)
- **Left column (1.05fr):**
  - Eyebrow pill: `[●] SOLANA-NATIVE PAYFI RAIL` (zinc-950 dot)
  - H1 (Outfit, 76px desktop / 48px mobile, line-height 1.02): "Programmable money for the AI age."
  - Lede (17.5px, ink-3, max-width 560px): "Settle helps humans, agents, merchants, and teams move money through plain-English rules, verifiable receipts, and trust-building reputation."
  - Email capture: `[input.input-lg "Work email"] [btn.primary.lg "Request access"]` — POSTs to `/api/waitlist`
  - Secondary link below: "Open product preview →" → routes to `/dashboard?demo=1` (read-only demo using the connected wallet OR a featured pubkey)
  - Foot row (12.5px, ink-4): "Public proof. · Private memos. · Human control."
- **Right column (0.95fr):** AgentCard demo bento card, min-height 420px
  - Eyebrow: AGENT POLICY · [pill.live] Live (emerald dot)
  - Code block (zinc-950 bg, JetBrains Mono 12.5px, line-height 1.85, white text):
    ```
    settle.agentCard.create({
      dailyCap: "$500",
      allow: ["data-api", "creator"],
      expires: "Friday 5pm",
      receipt: "public-proof"
    })
    ```
    keywords colored: `dailyCap` etc. = white, string values = `#86efac` (emerald-300), method `create` = `#fbbf24` (amber-400), comma/braces = white
  - Below code: avatar circle "R" (zinc-950 bg, white text) + name "Research Agent" + meta "$500 / day · allowlist · expires Fri" + secondary button "Revoke" (right-aligned)

### Stats strip (full width inside max-1216, padding 28px 0, top + bottom border)
- 3 columns separated by 1px borders
  - **`{total_allow_volume_display}`** + label "agent spend governed" + sub "Every dollar is scoped by a human-approved rule."
  - **`{p50_confirmation_ms}ms`** + "receipt finality preview" + "Fast enough for agents, legible enough for people."
  - **`{total_denied_count}`** + "blocked policy attempts" + "Denied spends become auditable proof, not vague errors."
- Numbers from `/api/stats/landing`. **If `is_presentable === false`, hide entire strip.** Don't fake.

### Product Surface section (max-1280, padding 80px 32px 40px)
- Eyebrow: PRODUCT SURFACE
- H2 (Outfit, 44px desktop, max-width 720px): "Money movement that explains itself before and after it happens."
- Bento grid (4 cols desktop, 2 mobile):
  - **AgentCard** card (span-2 + row-2, min-height 420px) — "Bounded spending power for AI agents." + body copy + nested mini-card showing Research Agent with progress bar
  - **Receipts** card (span-2) — "Verifiable proof for every movement."
  - **Rules** card (span-1) — "Plain-English controls before signatures."
  - **Pacts** card (span-1) — "Task-scoped agreements for teams and agents."

### Made-for-everyone section (max-1280, padding 40px 32px)
- Eyebrow: MADE FOR EVERYONE IN THE LOOP
- H2 (36px): "Six audiences. One settlement layer. Every interaction yields a receipt anyone can verify."
- 3-col grid of 6 audience cards (Consumer / Agent / Merchant / Developer / Operator / Public). Each: eyebrow (audience name), icon, h3, body, "Open surface →" foot.
- Click → routes to `/?surface=<id>` which sets the SurfaceSwitcher state and auto-redirects authed wallets to that surface's home.

### For Builders strip (dark, max-1280)
- Background `var(--ink)`, white text, padding 48px
- 2-col grid (0.9fr/1.1fr)
- Left: eyebrow.kicker-light "FOR BUILDERS", H2 (30px, white) "Built for agents, merchants, creators, and teams that need money rules to be readable.", body, 2 buttons (`btn.onstrip` "Open product preview" + `btn.onstrip-ghost` "Read the docs")
- Right: code card showing `settle.pay({ pact, rule, privacy })` snippet

### Trust Layer section (max-1280, padding 40px 32px)
- Eyebrow: TRUST LAYER
- H2 (30px): "Every rule translates into a user-facing explanation."
- 3-col grid of 3 cards, each: body quote (16px, font-weight 500) + foot eyebrow showing the pact/rule type

### Final CTA (card with email + button, padding 48px)
- Eyebrow: START BUILDING ON SETTLE
- H2 (36px): "Request access to the prototype."
- Inline form: email + Request access (POSTs same as hero form)

### Footer
- Logo · © 2026 Settle Labs · Built on Solana · Docs · API · Verify · Stats

### Real-data sources
- Stats strip: `/api/stats/landing` (presentability gated)
- Email capture: `POST /api/waitlist`
- "Open product preview" link: routes only

### Empty states
- Stats strip hidden when `is_presentable=false`
- Email capture: optimistic confirm, never blocks

### Loading
- Skeleton on stats strip for 800ms max, then either fade-in real values or hide

### Error
- Stats fetch fails → strip hidden silently, Sentry breadcrumb
- Email POST fails → inline error: "Couldn't reach the server. Try again." (no email leak)

### Mobile (390px)
- Hero: stacks. H1 drops to 48px. AgentCard demo card moves below the lede (full width)
- Stats strip: 3 columns become 1 stacked, no border between
- Bento grids: 2 columns
- Builders strip: stacks; code card moves below
- Footer: stacks logo + copyright + links column

### A11y
- Email input: `<label htmlFor>` (visually hidden but read by SR)
- All section h1/h2/h3 in correct order
- Code block in hero is `<pre>` with `aria-label="Example AgentCard creation code"`
- Audience cards: `<button>` not `<div>` — keyboardable

### Animations
- Hero AgentCard demo: subtle parallax on scroll (Framer scroll-linked, max 12px translate)
- Stats strip: count-up from 0 to value over 600ms when first scrolled into view (IntersectionObserver), respects `prefers-reduced-motion`
- Audience cards: hover lift (translateY -3px, border darken)

### Done when
- Visual matches prototype's `screen-landing.jsx` within 95% (per side-by-side screenshot)
- Stats strip hides correctly on devnet with low volume
- Email capture inserts to `waitlist` table
- 0 console errors with wallet disconnected
- Lighthouse ≥ 90 on mobile (perf, a11y, SEO)

---

## 2. Consumer Home — `/dashboard` (or `/` for connected wallet)

**Surface:** Consumer. **Auth:** wallet required (else redirect to `/?stay=1`).

### Hero (margin-bottom 28px)
- Eyebrow: "Hi @{handle}" — `var(--ink-4)`, 12px
- H1 (Outfit, 36px): "Move money. Trust the receipt."
- Subhead (14px, max-560): "Pay anyone, fund a Pact, or check what your agents did today. Every line below resolves to a verifiable on-chain receipt."
- Right side: 2 CTAs `[All receipts]` (secondary) + `[Send]` (primary, with paper-plane icon)

### Dark Balance Strip (margin-bottom 28px, full-width inside main, dark `var(--ink)` bg, padding 32px, border-radius 24px)
- Left (min-width 240, stretches):
  - Eyebrow (white/55%): "Available · USDC"
  - Display (Outfit, 64px, white, line-height 0.95): "${balance.usdc}"
  - Sub (white/60%, 13px): "{balance.sol} SOL · {cluster} · auto-refill ready"
- Right (gap 10px, flex-wrap):
  - `[btn.onstrip "Send"]` `[btn.onstrip-ghost "Save"]` `[btn.onstrip-ghost "Open Pact"]` `[btn.onstrip-ghost "Verify a receipt"]`

### Bento grid 1 (margin-bottom 28px, 4-col desktop)
- **Today** card (span-2):
  - Header: kicker "Today" + ghost button "See all" (right)
  - 3 stats in row: `${spent_usdc}` "spent · {spent_count} receipts" / `${received_usdc}` "received · {received_count} receipts" / `{agents_active}` "agents active"
  - Footer: SVG sparkline (~24h) showing receipt-count buckets
- **Agents on duty** card (span-2):
  - Header: kicker "Agents on duty" + ghost button "Manage"
  - Body: 3 rows, each = `[circle-letter] [label + cap-progress mono] / [bar (height 4)]`

### Recent receipts table (margin-bottom 28px, full width)
- Padding 20px 24px, bottom border between header and body
- Header: kicker "Recent receipts" + ghost button "All →"
- Table cols: Receipt (mono, 12px) / Kind (pill mono) / Counterparty / For (muted, max-240 truncate) / Amount (right, font-weight 500, with − sign) / Status (pill: ok = emerald dot, bad = red dot) / When (muted)
- Row click → `/receipts/[id]`

### Bento grid 2 (margin-bottom 28px, 3-col desktop)
- **Active Pacts** (span-2): header + 3-col inner grid of pact cards
  - Each pact card: 2 pill row [active] [OneShot/Streaming/DeliveryEscrow] + heading + meta + spent/cap mono row + 6px progress bar + expiry foot
  - Hover lift
- **Coming up** (span-1):
  - Kicker "Coming up", 2 rows: icon-square + label/cadence + amount mono
  - HR
  - Kicker "Saving toward", 2 progress rows (label + saved/goal mono + 4px bar)

### Footer educator card (`var(--bg)` light, padding 32px)
- Eyebrow: "The protocol underneath"
- Heading (24px): "Every payment is a 4-hash commitment."
- Right: secondary button "Try the verifier"
- 4-col grid of flat cards: 1·receipt_hash / 2·reason_hash / 3·policy_snapshot_hash / 4·purpose_hash, each with mono micro label + 12.5px description

### Real-data sources
- Hero handle: `useWallet().publicKey` → resolve `/api/handles/by-pubkey/[base58]`
- Everything else: `/api/dashboard?pubkey=` (single round trip, see WAVE_6_DATA.md §3)

### Empty states
- No receipts yet: "Today" stats show 0/0/0; sparkline hidden; "Welcome — your dashboard fills in as you transact" friendly empty hero replaces stats card content
- No agents: "Agents on duty" → CTA to `/agents` with copy "Hire your first agent"
- No pacts: "Active Pacts" → CTA "Open your first Pact" + brief explainer
- No coming up + no savings: hide whole right card

### Loading
- Skeleton boxes per cell, 600ms timeout to first paint, then fade-in

### Error
- Single API call → if 5xx, show inline banner top of main: "Couldn't load dashboard data. Retry?" with retry button. Don't render mock data.

### Mobile (390px)
- Hero stacks: title + sub on top, CTAs full-width below
- Dark strip: balance number drops to 48px, buttons wrap to 2 rows
- Bento grids: all spans collapse to 1 col
- Recent receipts table: switches to a list of cards (each row = mini receipt card)

### A11y
- Receipt rows: `role="link"` with `aria-label="Receipt {id}, {amount}, {decision}, {ts}"`
- Sparkline: `role="img"` with `aria-label="Receipt count over last 24 hours"`
- Progress bars: `role="progressbar"` with `aria-valuenow/min/max`

### Animations
- Hero: no animation (data-dense page, keep calm)
- Sparkline: draws from left to right on mount over 800ms, respects reduced-motion
- Pact card hover: lift + border darken
- Recent receipts row hover: bg `var(--rule-2)` 120ms

### Done when
- All 7 sub-queries from `/api/dashboard` render; total wall-time <500ms p95
- Empty wallet renders empty states for every cell, zero crashes
- Mobile 390px no horizontal scroll
- 64/64 E2E + new spec for `/dashboard` empty + populated states

---

## 3. Send — `/send`

**Surface:** Consumer. **Auth:** wallet required.

### Hero (compact)
- H1 (Outfit, 32px): "Send"
- Sub: "By handle, link, QR, or screenshot. Every send produces a sealed receipt."

### Body — single-column stack (max-width 640, centered)
1. **Recipient input** card: tabs `[@handle]` `[pubkey]` `[link]` `[QR/scan]`; each tab swaps the input
2. **Amount + asset** card: large input (Outfit, 48px) + asset toggle (USDC default, SOL secondary, future: any SPL)
3. **Note** card: text input + 🎙️ voice memo button (existing `<VoiceRecorder>`)
4. **Privacy / receipt** card: radio group [Public proof / Sealed memo / Private] — explains each in 1 line
5. **Preview & confirm** card: counterparty trust score, capability hash (if x402 path), estimated fee, hash-chain preview (4 dots animated)
6. **Send button** (primary, full-width, 56px height): "Send ${amount} →"

### Real-data sources
- Recipient resolution: existing `/api/resolve` endpoint
- Trust score: `/api/at/[handle]` (existing)
- Build TX: `/api/send/build` (existing)
- Confirm: client-side via `connection.sendRawTransaction`

### Empty states
- No recipient typed: send button disabled
- Wallet not connected: shell visible, send button replaced with "Connect wallet to send"

### Loading
- Send button transitions: idle → "Building tx…" → "Sign in your wallet" → "Confirming on Solana…" → "Sent ✓" (with confetti)

### Error
- Build failure: inline error in Preview card with retry
- Sign rejection: "User cancelled" banner, send button re-enabled
- Confirm timeout (>60s): "Tx submitted — view on Solscan" link, optimistic state

### Mobile (390px)
- Single column already; full-width inputs; voice button moves below note input

### A11y
- Each tab `role="tab"` with `aria-selected`
- Amount input has `aria-describedby` pointing to fee estimate
- Send button has `aria-busy` during loading

### Animations
- Tab switch: 200ms slide
- Send success: confetti (existing `fireSettlementConfetti`) + 4-dot hash-chain reveal in Preview card

### Done when
- Existing send flow works in new shell
- All 4 input modes (handle/pubkey/link/QR) functional
- Mobile flow tested end-to-end with burner wallet

---

## 4. Receipt detail — `/receipts/[requestId]`

**Surface:** Consumer (or Public if not authenticated — page stays open, just no edit affordances).

### Hero
- Back link: "← Card timeline" (or "← Receipts list" depending on referrer)
- H1: "{kind label} · {short id}"
- Pills: decision (ALLOW/DENY/REVIEW), kind, public/private flag

### Body — bento
1. **Big amount card** (full-width, dark gradient): "${amount} USDC" + counterparty avatar/handle/trust + "{decision}" pill + "Verified on slot {slot}"
2. **Hash chain animation** card: 4 hashes reveal sequentially (existing `HashChainAnimation`)
3. **Verification block** (existing): kernel commit re-derived client-side, shows PASS/FAIL
4. **Tags** (existing `ReceiptTags`)
5. **On-chain** card: tx signature link to Solscan, slot, confirmedMs
6. **Receipt actions** (footer): Print / Export / Drag-to-share / Refund (if eligible) / Dispute (if eligible)

### Real-data sources
- `/api/receipts/[requestId]` (existing)

### Empty states
- N/A — receipt either exists or 404

### Mobile
- Hero stacks; cards 1-col

### A11y
- Hash chain animation includes off-screen text fallback
- Decision pill: `aria-label="Decision: ALLOW"`

### Animations
- Hash-chain reveal (existing, ~1.5s)
- Confetti on first view if decision=ALLOW (existing trustGesture)

### Done when
- Existing receipt page renders in new shell with all functionality intact
- Print page (`/receipts/[id]/print`) reskinned to match
- Drag-share + tags both work

---

## 5. Card detail — `/cards/[id]`

**Surface:** Consumer or Agent (depending on role).

### Hero
- Back to `/cards`
- H1: "{label or handle}"
- Pills: status (active/revoked/closed), kind (OneShot/Streaming/DeliveryEscrow), pact_pubkey mono

### Body — bento
1. **Big spent/cap card**: "$X / $Y" + progress bar + expiry meta + revoke button (slide-to-confirm)
2. **Allowlist** card: list of allowed merchants/capabilities (chips) + add/remove
3. **Receipts feed** card: chronological receipts on this card (filtered list)
4. **Policy** tab (when surface=agent): rules JSON viewer + cap rules + replay-protection nonce

### Real-data sources
- `/api/cards/[id]` (existing)
- Receipts filtered: `/api/search/receipts?card={pubkey}`

### Empty states
- No receipts yet: "This card hasn't been used"
- Revoked: prominent banner (existing `RevokedCardBanner`)

### Animations
- Slide-to-confirm revoke (existing) + frost-shatter on success (existing)

### Done when
- Card detail renders in new shell
- Revoke flow + frost-shatter still work
- Tag chips render and edit works

---

## 6. Settings — `/settings`

**Surface:** Consumer. **Auth:** wallet required.

### Hero
- H1: "Settings"

### Body — left nav + right panel (256px nav, fluid panel)
- Nav sections:
  - **Profile**: handle, avatar, bio
  - **Wallet**: connected wallet, swap wallet, disconnect
  - **Theme & locale**: dark/light/auto, language
  - **Privacy**: default receipt visibility, sealed-memo defaults
  - **Exports**: link to `/settings/exports`
  - **Notifications**: push subscription, email
  - **Security**: revoke all cards, view active sessions, 2FA stub
  - **Danger zone**: delete handle (rare)

### Real-data sources
- Existing endpoints (settings is mature; just reskin)

### Done when
- All existing settings tabs migrated to new shell
- `/settings/exports` reskinned (already shipped, just visual update)

---

## Generic Reskin Template (for the other ~40 pages)

For every page not deep-spec'd above, the **template** is:

1. Wrap content in the **chrome** (sidebar + topbar)
2. **Hero** = page H1 (Outfit, 32px) + 1-line muted sub + 1-2 CTAs (right)
3. **Body** = bento grid where logical, single-column where data-dense
4. **Cards** use `BentoCard` primitive (white gradient bg, 24px radius, 1px zinc-200 border)
5. **Empty / Loading / Error** all defined with copy in WAVE_6_COPY.md
6. **Mobile**: bento spans collapse to 1 col, hero CTAs full-width below subhead, sidebar → drawer + bottom-tab
7. **A11y**: every interactive = button/link, aria-current on active nav, contrast ≥4.5:1

Pages that follow this template (by route):
- `/cards` (list), `/receipts` (list), `/groups`, `/wishes`, `/allowances`, `/feed`, `/leaderboard`, `/spending`, `/agents`, `/audit`, `/ledger`, `/activity`, `/onboarding`, `/help`, `/sandbox`, `/security`, `/public-goods`, `/at/[handle]`, `/at/[handle]/proof`, `/m/[handle]/*`, `/docs/*`, `/admin`, `/control-center`, `/verify-build`, `/verify`, `/verify/[hash]`, `/stats`, `/import`, `/pay`, `/pay/[token]`, `/pay/widget`, `/embed/pay` (already correct), `/blink`, `/claim`, `/g/[group_id]/request/[request_id]`, `/qr/[merchant]/[slug]`, `/split-bill/[id]`, `/request`, `/onboarding/*`, `/capabilities/discover`, `/capabilities/*`, `/leaderboard/[capabilityHash]`, `/onboarding`, `/brand` (NEW), `/changelog` (NEW), `/privacy` (NEW), `/terms` (NEW)

For each, the deep spec gets written **just-in-time** before that wave's coding starts (Wave 6.2 / 6.3 / 6.4). I'll add ~10 lines per page in this file at that point.

---

## Acceptance gate for the whole wave

Wave 6 ships only when:
1. Every page above renders in new shell
2. Every page has documented empty/loading/error
3. Every page passes a 390px mobile pass
4. Every page hits a11y contrast 4.5:1, keyboard-navigable, ARIA-labeled
5. Visual regression baselines updated, locked
6. New E2E specs added for: surface switcher, empty-state dashboard, populated-state dashboard, send happy path, receipt verify
7. Lighthouse landing ≥ 90 on mobile (perf/a11y/SEO/best-practices)
8. Bundle size: landing route < 100KB JS, dashboard route < 200KB JS
