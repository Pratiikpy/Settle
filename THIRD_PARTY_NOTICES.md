# Third-Party Notices

Settle includes and depends on work from the projects below. AGPL / GPL / SSPL deps are explicitly declared in the License Firewall section.

A complete lockfile-derived list is generated via `pnpm licenses ls --json > THIRD_PARTY_NOTICES.json` (run before each release tag).

---

## TypeScript / Node deps (top-level)

### Solana ecosystem
| Package | License | Used in | Notes |
|---|---|---|---|
| `@solana/kit` | Apache-2.0 | sdk | Modern Solana TS client (RPC + signers) |
| `@solana/web3.js` v1.95 | Apache-2.0 | web, api, indexer, demo-merchants | Legacy SDK — used for tx building + SPL token + Solana Pay |
| `@solana/wallet-adapter-*` | Apache-2.0 | web | Phantom, Privy, base, react, react-ui |
| `@solana/spl-token` | Apache-2.0 | web | SPL token + ATA + transferChecked |
| `@solana/pay` | Apache-2.0 | web | Solana Pay reference + QR builder |
| `@privy-io/react-auth` | MIT | web | Email/passkey alt auth |

### Metaplex (cNFT)
| Package | License | Used in |
|---|---|---|
| `@metaplex-foundation/umi` | Apache-2.0 | web, scripts |
| `@metaplex-foundation/umi-bundle-defaults` | Apache-2.0 | web, scripts |
| `@metaplex-foundation/mpl-bubblegum` | Apache-2.0 | web, scripts |
| `@metaplex-foundation/mpl-core` | Apache-2.0 | web |
| `@metaplex-foundation/mpl-token-metadata` | Apache-2.0 | scripts (cnft-setup) |
| `@metaplex-foundation/digital-asset-standard-api` | Apache-2.0 | web |

### Database / infra
| Package | License | Used in |
|---|---|---|
| `@supabase/supabase-js` | MIT | web, indexer, scripts |
| `@upstash/redis` | MIT | web (nonce store + rate limit) |
| `hono` | MIT | api, demo-merchants |
| `@hono/zod-validator` | MIT | api |
| `@hono/node-server` | MIT | demo-merchants |
| `next` | MIT | web |
| `react`, `react-dom` | MIT | web, ui |

### Names / oracles / commerce
| Package | License | Used in |
|---|---|---|
| `@bonfida/spl-name-service` | MIT | web (.sol resolver) |

### Crypto
| Package | License | Used in |
|---|---|---|
| `@noble/hashes` | MIT | sdk, web (BLAKE3, SHA-256) |
| `@noble/curves` | MIT | sdk, web, demo-agent (X25519, Ed25519) |
| `@noble/ciphers` | MIT | sdk, web (XChaCha20-Poly1305) |
| `bs58` | MIT | sdk, web, demo-agent, scripts |

### UI / motion / utils
| Package | License | Used in |
|---|---|---|
| `framer-motion` | MIT | web, ui |
| `lucide-react` | ISC | web |
| `sonner` | MIT | web (toasts) |
| `canvas-confetti` | ISC | web |
| `qrcode` | MIT | web |
| `tailwind-merge` | MIT | web |
| `clsx` | MIT | web |
| `tailwindcss` | MIT | web |
| `@vercel/og` | MPL-2.0 | web (dynamic OG images) |

### Dev / tooling
| Package | License | Used in |
|---|---|---|
| `turbo` | MPL-2.0 | root (binary, not vendored) |
| `typescript` | Apache-2.0 | all |
| `vitest` | MIT | sdk |
| `tsx` | MIT | scripts, demo-agent, indexer |
| `concurrently` | MIT | root (`pnpm dev:all`) |
| `prettier` | MIT | root |
| `eslint`, `eslint-config-next` | MIT | web |
| `dotenv` | BSD-2-Clause | scripts, demo-agent, indexer |
| `zod` | MIT | sdk, web, api |
| `@tanstack/react-query` | MIT | web |

### Validation / spec
| Package | License | Used in |
|---|---|---|
| `@hono/zod-validator` | MIT | api |

---

## Rust / Anchor program deps

| Crate | License |
|---|---|
| `anchor-lang` | Apache-2.0 |
| `anchor-spl` | Apache-2.0 |
| `solana-program` | Apache-2.0 |

---

## License firewall — explicit non-inclusions

Settle does **NOT** vendor source from these projects:

### Squads V4 (AGPL-3.0)
We do not copy any source from [`Squads-Protocol/squads-v4`](https://github.com/Squads-Protocol/squads-v4). When V2 wires Squads multisig spend/revoke flows, we will:
- CPI into the deployed Squads program at its on-chain address (this is permitted under AGPL — the AGPL distribution obligation triggers only on source distribution, not on calling a deployed program)
- Use the published `@sqds/multisig` npm package (MIT-licensed client wrapper, not AGPL)

### Galaxe / Token-2022 confidential transfer reference impls
Not used. Solana ZK ElGamal is disabled per Solana docs; we explicitly do NOT claim or ship Confidential Balances.

### Lighthouse SDK
Not yet published on npm as `@lighthouse-web3/sdk`. The `apps/web/lib/lighthouse.ts` helper returns `null` until the SDK ships. The Anchor program's atomic ix already enforces caps; Lighthouse is defense-in-depth (not load-bearing).

---

## Acknowledgements

- [`solana-developers/sealevel-attacks`](https://github.com/coral-xyz/sealevel-attacks) — security review patterns referenced in `SECURITY.md`
- [`coinbase/x402`](https://github.com/coinbase/x402) — protocol spec (license-compatible)
- [`dialectlabs/blinks`](https://github.com/dialectlabs/blinks) — Actions / Blinks spec
- [`metaplex-foundation/mpl-bubblegum`](https://github.com/metaplex-foundation/mpl-bubblegum) — cNFT primitives
- [`anza-xyz/kit`](https://github.com/anza-xyz/kit) — Solana TS SDK
- [`solana-foundation/pay`](https://github.com/solana-foundation/pay) — Solana Pay reference impl

---

## Reporting incorrect attribution

Open an issue on GitHub or email `xprtqk@gmail.com` with subject `SETTLE LICENSE`.
