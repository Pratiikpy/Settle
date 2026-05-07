# Settle — One-page proof index

> Click-through evidence. Every claim has a Solscan link, a UI URL, or a commit hash.

## On-chain transactions (devnet, Solscan-viewable)

```
https://solscan.io/tx/<sig>?cluster=devnet
```

| What | Signature |
|---|---|
| Consumer 0.01 USDC send (B4cArR1M…→ 29Az3i81…) | `2s71RsGrSML2Qu2eabEbkSg8aeMtHX2E9vhWvSMiM7N8KgGdwuMyMnVuWoBsCsJMRUZ61RWMXpeWUnHtH5kGjNMk` |
| `create_card` | `4gw5gcrYYThF7vgP8W1VbGWmGP8vGumpcFxB2X8SNVGAdMS9G9FEb8DAJY5LLndVbS88k4AhUAJUiJReMoCsM8wu` |
| `open_pact` (vault funded) | `2WujAXKC4bx5mEDyFFGgRN757Z2fW3BTD48M73guyNJrtbT1UG3rrW6ykk1psXod9F5Sd9vtzZNcSABFP16WSecK` |
| **`spend_via_pact` (Bug #26 runtime proof)** | `4ZzgMFwQQC87E9zxirFj8abogzbVmmZnogXboQGaBYogD9ah5FkKpRo3iQC28wMjAAgdVbnNdChwLnkznDS5vz6u` |
| `revoke` | `3euSBXmEqR4cBxnifaxR5HUDKL6Hi2ucp1Fynw4ccimYYpTJUjNKjfpApN31HjELShmNBxajx4GEqDtDcGXFYvkU` |
| `close_pact` (vault drained) | `3zpcVo3yon5dGGYZXVhVdzcsPSd2RSZRPMu3AEWwAow71FJcLcwpHW2PCXd88xDzdDwHZqv5zadfZJinJra1NNLW` |
| `open_streaming_pact` | `3aHBKMnREevjKRAAF88y6Hm5znfR5eAPbGBJZyhN7God2JnLd7zZrP3kwwFhacnWZrZNUh9km5vH82TxLdDjVRH1` |
| `claim_streaming` | `3cVPDeoxWbUbDAWEMQ2vmSwXaYoBVxvge5Xqx8jodhZGZQVagNGu6YTbsswAspwNuukndKc7Trem6irDvk5WRL5Z` |
| Allowed sub-cap spend (sanity) | `2mNSArk9XdNbJZ7ZCgtekpHoFn7fVqEeKfASGQxJ3w2n8ghdXHDNTbKgoQYfFTRFf4kEhhbEsiWJLo7X3VeQzPZu` |

**Anchor program:** `HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD`
Last Deployed In Slot: **460677446** (this session) — byte-equal to local `target/deploy/settle_agent_card.so`.

## Live UI URLs (use-settle.vercel.app)

| Page | Purpose |
|---|---|
| `/r/87d94764-cfdb-43c9-9361-18d00bde66ee` | Imported receipt — kernel hashes + Solscan crosslink |
| `/at/b4testv9l8cq` | Claimed handle profile (B4 Test) |
| `/at/B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp` | Pubkey URL → redirects to `/at/b4testv9l8cq` (Bug #50/#52) |
| `/at/29Az3i81KRa96seMfn13qH8o8eGALcyUYmcuyNaZC2xg` | Unclaimed pubkey → "No handle claimed" empty state (Bug #50) |
| `/admin/health` | Operator dashboard with inline `↳ error_message` (Bug #51) |
| `/api/verify/6c2b55edddae357c6b631b54e7f19c6c632b375c07cbce5432b04b19e1bf2924` | Receipt verifier round-trip (returns full kernel commit + sig) |
| `/api/handles/by-pubkey?pubkey=B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp` | Reverse-resolve (Bug #52, no-store on null) |
| `/api/actions/hire/research` | Solana Action / Blink (Phantom-renderable) |

## Single-command judge runner

```
cd apps/web && node e2e/phantom-qa/run-all.mjs
```

Output (last run):

```
▶ split-bill-multiwallet.mjs           ✓  PASS (5.1s)
▶ group-3wallet.mjs                    ✓  PASS (5.7s)
▶ handle-claim-webhook.mjs             ✓  PASS (5.7s)
▶ verify-bug-53.mjs                    ✓  PASS (2.2s)
▶ sdk-ts-e2e.mjs                       ✓  8/8 (2.6s)
▶ full-feature-driver.mjs              ✓  11/11 (10.6s)
▶ real-import-receipt.mjs              ✓  PASS (1.7s)
▶ real-group-voting.mjs                ✓  7/7 (10.1s)
▶ mcp-middleware-e2e.mjs               ✓  8/8 (1.2s)
▶ webhook-hmac-verify.mjs              ✓  8/8 (1.2s)
▶ create-merchant-scaffold.mjs         ✓  8/8 (0.6s)
11/11 drivers PASSED in 46.6s
```

## Bug fixes (commit hashes)

| # | Bug | Severity | Commit |
|---|---|---|---|
| 26 | `spend_via_pact` BPF stack overflow (4-day production blocker) | Critical | `89ab171` (source) + `6359d7b` (runtime proof) |
| 50 | `/at/<pubkey>` "Profile unavailable" dead-end | UX | `7eec61d` |
| 51 | `/admin/health` hid `error_message` for old failures | Diagnostic | `270944f` |
| 52 | `/api/handles/by-pubkey` cached null → broken claim→resolve UX | UX | `aa2e95e` |
| 53 | `/api/save-for` POST/PATCH/DELETE trusted body | Security | `400c609` |
| 54 | `round-up` upsert hijack + scheduled-sends + auto-refill | Security class | `c3c1a1d` |
| 55 | `/api/gift-sends` POST trusted body | Security | `2dcfa6d` |
| 56 | `disputes/resolve` allowed unauth deny + fake refund | **Security HIGH** | `47be22d` |
| 57+58 | `/receipts/<id>/refund` + `/tags` trusted body | Security | `e32a95b` |
| 59 | allowances + bookkeeper + capabilities | Security class | `67f30ca` |
| 60 | fraud/scan reputation poisoning + import/solana-pay | **Security HIGH** | `cd407ba` |
| 61 | group-accounts + request-spend trusted body | Security | `455332f` |

## What still requires operator action

- **Phantom dApp warning** — email `review@phantom.com` to delist `use-settle.vercel.app`.
- **Webhook live delivery** — insert a row in `verified_merchants` for the test wallet (auth chain already proven via `handle-claim-webhook.mjs`).
- **`SETTLE_RELAYER_PRIVKEY`** — set on Vercel for `phase5-signer` cron to fire `scheduled_send` on the post-fix binary.

## Documents

- `docs/SESSION_REPORT.md` — full evidence pack with every commit hash
- `docs/BUG_26_DEPLOY_LOG.md` — Bug #26 byte-equality proof + on-chain redeploy log
- `apps/web/e2e/phantom-qa/MISSION.md` — original mission file, status updated this session

## Key wallets

- **`B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp`** — operator's `id.json`, program upgrade authority, has 19+ USDC + 7 SOL on devnet, claimed handle `@b4testv9l8cq`.
- **Anchor program:** `HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD` (post-Bug-26 fix live at slot 460677446).
