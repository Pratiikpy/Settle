# Human Actions

These are actions an AI agent usually cannot complete alone because they require keys, accounts, browser wallet approval, external dashboards, money, or deployment authority.

## Local / Devnet

- Install Solana CLI and SBF toolchain if missing.
- Create/fund deployer wallet.
- Run devnet faucet for needed wallets.
- Run `pnpm deploy:devnet`.
- Confirm program ID is patched everywhere.
- Run Anchor runtime tests.
- Run browser smoke test with Phantom.

## Environment Variables

Populate `.env.local` / deployment envs:

- Supabase URL/key/service role.
- Helius RPC/API key.
- Facilitator private key.
- USDC mint per cluster.
- Sealed-box keys.
- VAPID keys.
- Badge/zk/compression keys.
- Optional AI provider keys.
- Optional webhook/operator signing keys.

## External Services

- Vercel project and production deploy.
- Supabase project and migrations.
- Helius project.
- Dialect Actions Registry submission for Blinks.
- Phantom/mobile manual verification.
- Domain verification for merchant handles.

## Mainnet / Funded Later

- Mainnet deploy after audit-level confidence.
- Real mainnet USDC transactions.
- Banking/card/KYC/audit vendor actions.
- Bug bounty payouts.
- Paid API quotas beyond free tier.

## Security-Sensitive

- Rotate any leaked tokens or private keys.
- Never paste production private keys into chat.
- Keep deployer/facilitator/sealed-box/operator keys separate.
- Record key ownership and rotation plan outside public repo.

