# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: section-23b-A-extended.spec.ts >> §23b.A extended · consumer matrix >> 23b.A80 — settings /settings
- Location: e2e\section-23b-A-extended.spec.ts:185:5

# Error details

```
Error: apiRequestContext._wrapApiCall: ENOENT: no such file or directory, open 'C:\Users\prate\Downloads\solana\settle-protocol\apps\web\test-results\.playwright-artifacts-174\traces\70cbc0b19fb07d6da69d-a9e60dee0cc503969adc.trace'
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - navigation [ref=e4]:
      - generic [ref=e5]:
        - link "Settle home" [ref=e6] [cursor=pointer]:
          - /url: /
          - generic [ref=e7]:
            - img "Settle" [ref=e8]
            - generic [ref=e15]: Settle
        - generic [ref=e16]:
          - link "Product" [ref=e17] [cursor=pointer]:
            - /url: /docs
          - link "Receipts" [ref=e18] [cursor=pointer]:
            - /url: /leaderboard
          - link "Docs" [ref=e19] [cursor=pointer]:
            - /url: /docs
          - link "API" [ref=e20] [cursor=pointer]:
            - /url: /docs#graphql
        - link "Verify a receipt" [ref=e21] [cursor=pointer]:
          - /url: /verify
        - button "Select Wallet" [active] [ref=e24] [cursor=pointer]
        - link "Request access →" [ref=e25] [cursor=pointer]:
          - /url: "#request-access"
    - main [ref=e26]:
      - generic [ref=e28]:
        - generic [ref=e29]:
          - generic [ref=e30]: Solana-native payments app
          - heading "Programmable money for the AI age." [level=1] [ref=e32]
          - paragraph [ref=e33]: Settle helps humans, agents, merchants, and teams move money through plain-English rules, verifiable receipts, and trust-building reputation.
          - generic [ref=e35]:
            - generic [ref=e36]: Work email
            - textbox "Work email Work email" [ref=e37]:
              - /placeholder: Work email
            - button "Request access" [ref=e38] [cursor=pointer]
          - link "Open product preview →" [ref=e39] [cursor=pointer]:
            - /url: /dashboard?demo=1
          - generic [ref=e40]:
            - generic [ref=e41]: Public proof.
            - generic [ref=e43]: Private memos.
            - generic [ref=e45]: Human control.
        - generic [ref=e46]:
          - generic [ref=e47]:
            - generic [ref=e48]: Agent policy
            - generic [ref=e49]: Live
          - generic [ref=e51]: "settle.agentCard.create({ dailyCap: \"$500\", allow: [\"data-api\", \"creator\"], expires: \"Friday 5pm\", receipt: \"public-proof\" })"
          - generic [ref=e52]:
            - generic [ref=e53]: R
            - generic [ref=e54]:
              - generic [ref=e55]: Research Agent
              - generic [ref=e56]: $500 / day · allowlist · expires Fri
            - button "Revoke" [ref=e57] [cursor=pointer]
      - region "Live agent activity" [ref=e58]:
        - generic [ref=e59]:
          - generic [ref=e64]: settle://live
          - generic [ref=e66]: preview · scenario
        - generic [ref=e67]:
          - generic [ref=e68]:
            - generic [ref=e69]: "[21:07:25]"
            - generic [ref=e70]: agent
            - generic [ref=e71]: "@TripPlanner"
            - generic [ref=e72]: $4.20
            - generic [ref=e73]: → ✓ allowed
            - generic [ref=e74]: "#a7f29e"
          - generic [ref=e75]:
            - generic [ref=e76]: "[21:07:55]"
            - generic [ref=e77]: agent
            - generic [ref=e78]: "@TripPlanner"
            - generic [ref=e79]: $50.00
            - generic [ref=e80]: → ✗ BLOCKED (over_limit)
            - generic [ref=e81]: "#b8e12c"
          - generic [ref=e82]:
            - generic [ref=e83]: "[21:08:15]"
            - generic [ref=e84]: agent
            - generic [ref=e85]: "@ResearchBot"
            - generic [ref=e86]: $1.99
            - generic [ref=e87]: → ✓ allowed
            - generic [ref=e88]: "#c3d4f1"
      - paragraph [ref=e90]:
        - text: Stablecoins will move trillions. A growing share will be agent-driven.
        - text: Settle makes that money revocable, auditable, and provably yours.
      - generic [ref=e91]:
        - generic [ref=e92]:
          - text: Product surface
          - heading "Money movement that explains itself before and after it happens." [level=2] [ref=e93]
        - generic [ref=e94]:
          - generic [ref=e95]:
            - generic [ref=e97]: AgentCard
            - heading "Bounded spending power for AI agents." [level=3] [ref=e98]
            - paragraph [ref=e99]: Give an agent a daily cap, allowlist, expiry, and purpose — then revoke it instantly if behavior changes.
            - generic [ref=e100]:
              - generic [ref=e101]:
                - generic [ref=e102]: R
                - generic [ref=e103]:
                  - generic [ref=e104]: Research Agent
                  - generic [ref=e105]: spending today
                - generic [ref=e107]:
                  - text: $184
                  - generic [ref=e108]: / $500
              - progressbar [ref=e109]
              - generic [ref=e111]:
                - generic [ref=e112]: $500 / day
                - generic [ref=e113]: Allowlist · 4
                - generic [ref=e114]: Expiry · Fri
          - generic [ref=e115]:
            - generic [ref=e117]: Receipts
            - heading "Verifiable proof for every movement." [level=3] [ref=e118]
            - paragraph [ref=e119]: Receipts explain who paid, what rule allowed it, what changed on-chain, and what can happen next.
          - generic [ref=e120]:
            - generic [ref=e122]: Rules
            - heading "Plain-English controls before signatures." [level=3] [ref=e123]
            - paragraph [ref=e124]: Users see the budget, refund window, merchant trust, and privacy state before money moves.
          - generic [ref=e125]:
            - generic [ref=e127]: Pacts
            - heading "Task-scoped agreements for teams and agents." [level=3] [ref=e128]
            - paragraph [ref=e129]: OneShot, Streaming, and DeliveryEscrow flows keep outcomes clear without crypto jargon.
      - generic [ref=e130]:
        - generic [ref=e131]:
          - text: Made for everyone in the loop
          - heading "Six audiences. One settlement layer. Every interaction yields a receipt anyone can verify." [level=2] [ref=e132]
        - generic [ref=e133]:
          - link "Consumer Pay & receive Send by handle, link, QR, or screenshot. Get sealed receipts. Open surface →" [ref=e134] [cursor=pointer]:
            - /url: /?surface=consumer
            - generic [ref=e135]: Consumer
            - heading "Pay & receive" [level=3] [ref=e136]
            - paragraph [ref=e137]: Send by handle, link, QR, or screenshot. Get sealed receipts.
            - generic [ref=e139]: Open surface →
          - link "Agent Programmable spend AgentCards with caps + allowlists. Templates and a hire-Blink. Open surface →" [ref=e140] [cursor=pointer]:
            - /url: /?surface=agent
            - generic [ref=e141]: Agent
            - heading "Programmable spend" [level=3] [ref=e142]
            - paragraph [ref=e143]: AgentCards with caps + allowlists. Templates and a hire-Blink.
            - generic [ref=e145]: Open surface →
          - link "Merchant Get paid Public profile, capabilities, DNS verify, QR, webhooks, disputes. Open surface →" [ref=e146] [cursor=pointer]:
            - /url: /?surface=merchant
            - generic [ref=e147]: Merchant
            - heading "Get paid" [level=3] [ref=e148]
            - paragraph [ref=e149]: Public profile, capabilities, DNS verify, QR, webhooks, disputes.
            - generic [ref=e151]: Open surface →
          - link "Developer Build on Settle Pay / Verify / Webhooks / API. SDKs, MCP, embed components. Open surface →" [ref=e152] [cursor=pointer]:
            - /url: /?surface=developer
            - generic [ref=e153]: Developer
            - heading "Build on Settle" [level=3] [ref=e154]
            - paragraph [ref=e155]: Pay / Verify / Webhooks / API. SDKs, MCP, embed components.
            - generic [ref=e157]: Open surface →
          - link "Operator Run a deploy Health, federation, cron, preflight, verifiable build. Open surface →" [ref=e158] [cursor=pointer]:
            - /url: /?surface=operator
            - generic [ref=e159]: Operator
            - heading "Run a deploy" [level=3] [ref=e160]
            - paragraph [ref=e161]: Health, federation, cron, preflight, verifiable build.
            - generic [ref=e163]: Open surface →
          - link "Public Verify · stats Walletless verifier, capability heatmap, network stats, public feed. Open surface →" [ref=e164] [cursor=pointer]:
            - /url: /?surface=public
            - generic [ref=e165]: Public
            - heading "Verify · stats" [level=3] [ref=e166]
            - paragraph [ref=e167]: Walletless verifier, capability heatmap, network stats, public feed.
            - generic [ref=e169]: Open surface →
      - generic [ref=e172]:
        - generic [ref=e173]:
          - text: For builders
          - heading "Built for agents, merchants, creators, and teams that need money rules to be readable." [level=2] [ref=e174]
          - paragraph [ref=e175]: Integrate programmable payments without making users decode wallets, signatures, or raw transaction logs.
          - generic [ref=e176]:
            - link "Open product preview →" [ref=e177] [cursor=pointer]:
              - /url: /dashboard?demo=1
            - link "Read the docs" [ref=e178] [cursor=pointer]:
              - /url: /docs
        - generic [ref=e179]:
          - generic [ref=e180]:
            - generic [ref=e181]: settle-protocol-sdk
            - generic [ref=e182]: v0.2.0
          - generic [ref=e183]: "const receipt = await settle.pay({ pact: \"delivery-escrow\", rule: \"release_after_approval\", privacy: \"public proof, private memo\" })"
      - generic [ref=e184]:
        - generic [ref=e185]:
          - text: Trust layer
          - heading "Every rule translates into a user-facing explanation." [level=2] [ref=e186]
        - generic [ref=e187]:
          - generic [ref=e188]:
            - paragraph [ref=e189]: Refund available for 3 days, then funds release automatically unless disputed.
            - generic [ref=e190]: Pact · DeliveryEscrow
          - generic [ref=e191]:
            - paragraph [ref=e192]: This agent can only pay approved APIs and cannot exceed $85 per call.
            - generic [ref=e193]: AgentCard · Allowlist
          - generic [ref=e194]:
            - paragraph [ref=e195]: This denied spend is proof that the policy protected your balance.
            - generic [ref=e196]: Rule · Daily cap exceeded
      - generic [ref=e199]:
        - generic [ref=e200]:
          - text: Start building on Settle
          - heading "Request access." [level=2] [ref=e201]
        - generic [ref=e203]:
          - generic [ref=e204]: Work email
          - textbox "Work email" [ref=e205]
          - button "Request access" [ref=e206] [cursor=pointer]
    - contentinfo [ref=e207]:
      - generic [ref=e208]:
        - generic [ref=e209]:
          - img "Settle" [ref=e210]
          - generic [ref=e217]: Settle
        - generic [ref=e218]: © 2026 Settle Labs · Built on Solana
        - link "Docs" [ref=e219] [cursor=pointer]:
          - /url: /docs
        - link "API" [ref=e220] [cursor=pointer]:
          - /url: /docs#graphql
        - link "Verify" [ref=e221] [cursor=pointer]:
          - /url: /verify
        - link "Stats" [ref=e222] [cursor=pointer]:
          - /url: /stats
        - link "Brand" [ref=e223] [cursor=pointer]:
          - /url: /brand
        - link "Privacy" [ref=e224] [cursor=pointer]:
          - /url: /privacy
        - link "Terms" [ref=e225] [cursor=pointer]:
          - /url: /terms
  - region "Notifications alt+T"
  - alert [ref=e226]
  - dialog [ref=e227]:
    - generic [ref=e229]:
      - button [ref=e230] [cursor=pointer]:
        - img [ref=e231]
      - heading "Connect a wallet on Solana to continue" [level=1] [ref=e233]
      - list [ref=e234]:
        - listitem [ref=e235]:
          - button "Phantom icon Phantom" [ref=e236] [cursor=pointer]:
            - img "Phantom icon" [ref=e238]
            - text: Phantom
```

# Test source

```ts
  94  |       await page.goto("/groups");
  95  |       await expect(page.locator("main").first()).toBeVisible();
  96  |     } finally {
  97  |       await ctx.close();
  98  |     }
  99  |   });
  100 | 
  101 |   // Savings buckets
  102 |   test("23b.A57 — /wishes savings buckets surface", async ({ browser }) => {
  103 |     test.setTimeout(60_000);
  104 |     const ctx = await openPersonaContext(browser, ALICE_KEY);
  105 |     try {
  106 |       const page = await ctx.newPage();
  107 |       await connect(page);
  108 |       await page.goto("/wishes");
  109 |       await expect(page.locator("main").first()).toBeVisible();
  110 |     } finally {
  111 |       await ctx.close();
  112 |     }
  113 |   });
  114 | 
  115 |   // Round-up rule
  116 |   test("23b.A59 — /spending round-up surface", async ({ browser }) => {
  117 |     test.setTimeout(60_000);
  118 |     const ctx = await openPersonaContext(browser, ALICE_KEY);
  119 |     try {
  120 |       const page = await ctx.newPage();
  121 |       await connect(page);
  122 |       const r = await page.goto("/spending");
  123 |       expect(r?.status()).toBeLessThan(400);
  124 |     } finally {
  125 |       await ctx.close();
  126 |     }
  127 |   });
  128 | 
  129 |   // Allowances
  130 |   test("23b.A63 — /allowances parent view", async ({ browser }) => {
  131 |     test.setTimeout(60_000);
  132 |     const ctx = await openPersonaContext(browser, ALICE_KEY);
  133 |     try {
  134 |       const page = await ctx.newPage();
  135 |       await connect(page);
  136 |       await page.goto("/allowances");
  137 |       await expect(page.locator("main").first()).toBeVisible();
  138 |     } finally {
  139 |       await ctx.close();
  140 |     }
  141 |   });
  142 | 
  143 |   // Split-bill
  144 |   test("23b.A67-A68 — /split-bill list surface", async ({ browser }) => {
  145 |     test.setTimeout(60_000);
  146 |     const ctx = await openPersonaContext(browser, ALICE_KEY);
  147 |     try {
  148 |       const page = await ctx.newPage();
  149 |       await connect(page);
  150 |       await page.goto("/split-bill");
  151 |       await expect(page.locator("main").first()).toBeVisible();
  152 |     } finally {
  153 |       await ctx.close();
  154 |     }
  155 |   });
  156 | 
  157 |   // Notifications
  158 |   test("23b.A69 — /activity inbox surface", async ({ browser }) => {
  159 |     test.setTimeout(60_000);
  160 |     const ctx = await openPersonaContext(browser, ALICE_KEY);
  161 |     try {
  162 |       const page = await ctx.newPage();
  163 |       await connect(page);
  164 |       await page.goto("/activity");
  165 |       await expect(page.locator("main").first()).toBeVisible();
  166 |     } finally {
  167 |       await ctx.close();
  168 |     }
  169 |   });
  170 | 
  171 |   // Profile / followers
  172 |   test("23b.A74 — follow button on /at/[handle]", async ({ page }) => {
  173 |     const r = await page.goto("/at/satoshi");
  174 |     expect([200, 404].includes(r?.status() ?? 0)).toBeTruthy();
  175 |   });
  176 | 
  177 |   // Settings sections
  178 |   for (const [id, path] of [
  179 |     ["A77", "/settings"],
  180 |     ["A79", "/settings"],
  181 |     ["A80", "/settings"],
  182 |     ["A81", "/settings"],
  183 |     ["A82", "/settings"],
  184 |   ] as const) {
  185 |     test(`23b.${id} — settings ${path}`, async ({ browser }) => {
  186 |       test.setTimeout(60_000);
  187 |       const ctx = await openPersonaContext(browser, ALICE_KEY);
  188 |       try {
  189 |         const page = await ctx.newPage();
  190 |         await connect(page);
  191 |         await page.goto(path);
  192 |         await expect(page.locator("main").first()).toBeVisible();
  193 |       } finally {
> 194 |         await ctx.close();
      |                   ^ Error: apiRequestContext._wrapApiCall: ENOENT: no such file or directory, open 'C:\Users\prate\Downloads\solana\settle-protocol\apps\web\test-results\.playwright-artifacts-174\traces\70cbc0b19fb07d6da69d-a9e60dee0cc503969adc.trace'
  195 |       }
  196 |     });
  197 |   }
  198 | });
  199 | 
```