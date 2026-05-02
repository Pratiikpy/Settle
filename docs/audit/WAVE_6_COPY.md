# WAVE_6_COPY — every user-facing string, decided

Inventory of strings that ship. **Tone rule:** direct, plain, no jargon, no marketing fluff. We talk like a payment app for adults, not a crypto product. Numbers and names land hard, modifiers don't.

For each: **prototype copy** → **decision** (KEEP / REWRITE / CUT) → **final copy if rewriting**.

---

## Landing page

| Section | Prototype copy | Decision | Final |
|---|---|---|---|
| Eyebrow pill | `● SOLANA-NATIVE PAYFI RAIL` | REWRITE — "PayFi rail" is jargon judges complained about per memory | `● SOLANA-NATIVE PAYMENTS APP` |
| H1 | "Programmable money for the AI age." | KEEP | "Programmable money for the AI age." |
| Lede | "Settle helps humans, agents, merchants, and teams move money through plain-English rules, verifiable receipts, and trust-building reputation." | KEEP | (same) |
| CTA primary | "Request access" | KEEP | "Request access" |
| CTA secondary | "Open product preview →" | KEEP | "Open product preview →" |
| Trust row | "Public proof. · Private memos. · Human control." | KEEP | (same) |
| AgentCard demo eyebrow | "AGENT POLICY" + "● Live" | KEEP | (same) |
| AgentCard code | `settle.agentCard.create({ dailyCap: "$500", allow: ["data-api","creator"], expires: "Friday 5pm", receipt: "public-proof" })` | KEEP — but verify the actual SDK shape uses these field names. If not, rewrite to match SDK exactly. | (TBD: verify @settle/sdk → match) |
| Stats stat 1 label | "agent spend governed" | KEEP | (same) |
| Stats stat 1 sub | "Every dollar is scoped by a human-approved rule." | KEEP | (same) |
| Stats stat 2 label | "receipt finality preview" | REWRITE — "preview" is weird | "receipt finality, p50" |
| Stats stat 2 sub | "Fast enough for agents, legible enough for people." | KEEP | (same) |
| Stats stat 3 label | "blocked policy attempts" | KEEP | (same) |
| Stats stat 3 sub | "Denied spends become auditable proof, not vague errors." | KEEP | (same) |
| Product surface eyebrow | "PRODUCT SURFACE" | KEEP | (same) |
| Product surface H2 | "Money movement that explains itself before and after it happens." | KEEP | (same) |
| AgentCard tile heading | "Bounded spending power for AI agents." | KEEP | (same) |
| AgentCard tile body | "Give an agent a daily cap, allowlist, expiry, and purpose — then revoke it instantly if behavior changes." | KEEP | (same) |
| Receipts tile heading | "Verifiable proof for every movement." | KEEP | (same) |
| Receipts tile body | "Receipts explain who paid, what rule allowed it, what changed on-chain, and what can happen next." | KEEP | (same) |
| Rules tile heading | "Plain-English controls before signatures." | KEEP | (same) |
| Rules tile body | "Users see the budget, refund window, merchant trust, and privacy state before money moves." | KEEP | (same) |
| Pacts tile heading | "Task-scoped agreements for teams and agents." | KEEP | (same) |
| Pacts tile body | "OneShot, Streaming, and DeliveryEscrow flows keep outcomes clear without crypto jargon." | KEEP | (same) |
| Audience section eyebrow | "MADE FOR EVERYONE IN THE LOOP" | KEEP | (same) |
| Audience section H2 | "Six audiences. One settlement layer. Every interaction yields a receipt anyone can verify." | KEEP | (same) |
| Audience: Consumer | "Pay & receive" / "Send by handle, link, QR, or screenshot. Get sealed receipts." | KEEP | (same) |
| Audience: Agent | "Programmable spend" / "AgentCards with caps + allowlists. Templates and a hire-Blink." | KEEP | (same) |
| Audience: Merchant | "Get paid" / "Public profile, capabilities, DNS verify, QR, webhooks, disputes." | KEEP | (same) |
| Audience: Developer | "Build on Settle" / "Pay / Verify / Webhooks / API. SDKs, MCP, embed components." | KEEP | (same) |
| Audience: Operator | "Run a deploy" / "Health, federation, cron, preflight, verifiable build." | KEEP | (same) |
| Audience: Public | "Verify · stats" / "Walletless verifier, capability heatmap, network stats, public feed." | KEEP | (same) |
| For Builders eyebrow | "FOR BUILDERS" | KEEP | (same) |
| For Builders H2 | "Built for agents, merchants, creators, and teams that need money rules to be readable." | KEEP | (same) |
| For Builders body | "Integrate programmable payments without making users decode wallets, signatures, or raw transaction logs." | KEEP | (same) |
| For Builders code label | `settle-sdk.ts v1.0` | REWRITE — version pin should match real SDK | `settle-sdk.ts v0.2.0` (current) |
| For Builders code | `settle.pay({ pact: "delivery-escrow", rule: "release_after_approval", privacy: "public proof, private memo" })` | VERIFY — match actual SDK or rewrite to a real working snippet | (TBD per SDK) |
| Trust eyebrow | "TRUST LAYER" | KEEP | (same) |
| Trust H2 | "Every rule translates into a user-facing explanation." | KEEP | (same) |
| Trust quote 1 | "Refund available for 3 days, then funds release automatically unless disputed." | KEEP | (same) |
| Trust quote 1 source | "Pact · DeliveryEscrow" | KEEP | (same) |
| Trust quote 2 | "This agent can only pay approved APIs and cannot exceed $85 per call." | KEEP | (same) |
| Trust quote 2 source | "AgentCard · Allowlist" | KEEP | (same) |
| Trust quote 3 | "This denied spend is proof that the policy protected your balance." | KEEP | (same) |
| Trust quote 3 source | "Rule · Daily cap exceeded" | KEEP | (same) |
| Final CTA eyebrow | "START BUILDING ON SETTLE" | KEEP | (same) |
| Final CTA H2 | "Request access to the prototype." | REWRITE — "prototype" sounds half-baked | "Request access." |
| Footer copyright | "© 2026 Settle Labs · Built on Solana" | KEEP | (same) |

---

## App shell

| Element | Copy | Notes |
|---|---|---|
| Logo wordmark | "Settle" | Always paired with the mark in chrome; standalone wordmark only in landing footer |
| Sidebar consumer top | (no section label) | — |
| Sidebar consumer · Money | "Money" | uppercase 11px |
| Sidebar consumer · You | "You" | uppercase 11px |
| Cluster badge devnet | "devnet" | mono, lowercase |
| Cluster badge mainnet | "mainnet" | mono, lowercase |
| Wallet button (disconnected) | "Connect wallet" | primary |
| Wallet button (connected) | `@{handle}` + truncated pubkey + initial | |
| Surface tab labels | Consumer / Agent / Merchant / Developer / Operator / Public | |

---

## Per-page heroes (final)

| Page | Eyebrow / kicker | H1 | Sub |
|---|---|---|---|
| `/dashboard` | "Hi @{handle}" | "Move money. Trust the receipt." | "Pay anyone, fund a Pact, or check what your agents did today. Every line below resolves to a verifiable on-chain receipt." |
| `/send` | (none) | "Send" | "By handle, link, QR, or screenshot. Every send produces a sealed receipt." |
| `/receipts` | (none) | "Receipts" | "Every payment Settle has touched. Filter by kind, decision, or counterparty." |
| `/cards` | (none) | "Cards & Pacts" | "Programmable spending surfaces — your AgentCards plus the OneShot, Streaming, and Escrow Pacts open against them." |
| `/agents` | (none) | "Agents" | "Hire AI agents with bounded budgets. Watch them work. Revoke instantly." |
| `/groups` | (none) | "Groups" | "Shared spending with N-of-M quorum. Members sign attestations; the cron fires the spend on a Pact-scoped account." |
| `/wishes` | (none) | "Savings" | "Round up, set goals, watch them fill." |
| `/allowances` | (none) | "Schedule" | "Recurring sends — rent, allowances, donations — driven by Pacts." |
| `/spending` | (none) | "Spending" | "Top-up rules and auto-refill triggers." |
| `/feed` | (none) | "Feed" | "Public-flagged ALLOW receipts, live." |
| `/leaderboard` | (none) | "Capability heatmap" | "Live grid of which AI services agents are paying right now." |
| `/audit` | (none) | "Decision audit" | "Every ALLOW and DENY, with the policy that decided." |
| `/ledger` | (none) | "Ledger" | "All receipts, sortable, exportable." |
| `/activity` | (none) | "Activity" | "Everything touching this wallet." |
| `/settings` | (none) | "Settings" | "Profile, theme, exports, security." |
| `/at/[handle]` | "Profile" | "@{handle}" | "{trust_score} · {follower_count} followers" |
| `/at/[handle]/proof` | "Public proof" | "@{handle}" | "Verifiable trust score, capability history, public receipts." |
| `/m/[handle]` | "Merchant" | "{merchant_name}" | "{capability_count} capabilities · {trust} trust · {follower_count} followers" |
| `/m/[handle]/manage` | "Merchant" | "Overview" | "Revenue, capabilities, disputes, webhooks." |
| `/docs` | (none) | "Docs" | "Pay component, Verify component, Webhooks, MCP middleware, SDKs." |
| `/sandbox` | (none) | "Sandbox" | "Try every primitive without a real wallet — burner wallet auto-spawned." |
| `/control-center` | (none) | "Control center" | "Health, cron ticks, indexer cursor, RPC p50, federation peers." |
| `/admin` | (none) | "Admin" | "Internal-only operator surface." |
| `/verify-build` | (none) | "Verifiable build" | "Reproduce the on-chain program from this commit." |
| `/verify` | (none) | "Verify a receipt" | "Paste a request_id or hash. We re-derive the 4 commitments client-side and compare to chain." |
| `/stats` | (none) | "Network" | "Live receipt activity across Settle." |
| `/security` | (none) | "Security" | "How we protect your money: 4-hash kernel, RLS-protected database, on-chain program audit." |
| `/brand` (NEW) | (none) | "Brand" | "Logo, tokens, fonts. Use them." |
| `/changelog` (NEW) | (none) | "Changelog" | "What shipped." |
| `/privacy` (NEW) | (none) | "Privacy" | "What we collect, what we don't, what we'd never." |
| `/terms` (NEW) | (none) | "Terms" | "How Settle works, plainly." |

---

## Empty-state copy

| Surface / cell | Empty copy | Action |
|---|---|---|
| Dashboard hero (no receipts) | "Welcome — your dashboard fills in as you transact." | "Send your first" → `/send` |
| Today (zero receipts) | "Nothing today yet." | (none) |
| Agents on duty (none) | "No agents yet. AgentCards turn AI workflows into bounded spend." | "Hire your first agent" → `/agents` |
| Active Pacts (none) | "No active Pacts." | "Open a Pact" → `/cards/new` |
| Recent receipts (none) | "No receipts yet." | "Send to anyone" → `/send` |
| Coming up (none) | "Nothing scheduled." | "Add a recurring send" → `/allowances/new` |
| Saving toward (none) | "No savings goals." | "Start saving" → `/wishes/new` |
| Receipts list (filtered, none) | "No receipts match." | "Clear filters" |
| Cards list (none) | "You haven't created any cards or Pacts yet." | "Create AgentCard" → `/cards/new` |
| Groups (none) | "No groups. Groups let N members approve before a spend fires." | "Create a group" → `/groups/new` |
| Disputes (merchant, none) | "No disputes. Keep it that way." | (none) |
| Federation peers (none) | "No federation peers connected." | (operator-only) |
| Heatmap (no live data) | "Nothing live right now. Capabilities will appear as agents spend." | (none) |
| Walletless verifier (no input) | "Paste a request_id or 32-byte hex hash above." | (none) |

---

## Loading copy

| State | Copy |
|---|---|
| Initial fetch | (skeleton, no copy) |
| >1.5s | "Still loading…" (small text, polite) |
| Retrying | "Retrying… (attempt {n})" |

---

## Error copy

| Error | Copy |
|---|---|
| Generic API 5xx | "Something went wrong on our end. Try again?" |
| Network offline | "You're offline. Reconnect to load this." |
| Wallet rejected | "You cancelled. No money moved." |
| Insufficient funds | "Not enough USDC. You need ${needed}, you have ${have}." |
| Capability denied | "This spend was denied by your policy: {reason}." |
| Receipt not found | "We couldn't find that receipt. The id might be wrong." |
| Handle taken | "@{handle} is taken. Try another." |
| Rate limited | "Too many tries. Wait a minute and retry." |

---

## Button labels

| Action | Label | Notes |
|---|---|---|
| Primary positive | "Send", "Pay $X", "Hire agent", "Create Pact", "Confirm" | one verb |
| Primary destructive | "Revoke" (with slide-to-confirm), "Delete handle" | red text |
| Secondary | "Cancel", "Save draft", "Edit" | |
| Ghost | "View all", "See more", "Try the verifier" | |
| Disabled | (action) — show reason in helper text below | |

---

## Microcopy rules

- **No "please".** It's noise.
- **No "we apologize".** Apologize by fixing the bug.
- **No "kindly".** Same.
- **Numbers always concrete.** "$0.42" not "less than a dollar"; "423ms" not "fast".
- **Verbs over nouns.** "Send" not "Make a send".
- **No metaphors that confuse.** "Pact" is a defined product noun, allowed. "Receipt" is allowed (everyone knows what one is). "Kernel" appears once on landing then never again user-facing.
- **Devnet banner copy:** "You're on devnet. No real money." — never hidden, top-of-app strip when cluster=devnet, dismissible per session.
