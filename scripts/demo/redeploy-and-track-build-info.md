# Verify-build redeploy — exact steps

The `/api/verify-build` endpoint currently returns `claimed: null, matches: null`
because:

1. The local `programs/settle-agent-card/target/deploy/build-info.json` is
   `.gitignore`d and not shipped with the Vercel deploy.
2. The deployed bytecode hash on devnet (`07cc62fc1b02490bcb…`) was built from
   a clean tagged commit; the latest local build is dirty (`37307f9984…`),
   so even if we tracked it the comparison would show `matches: false`.

To get `/verify-build` rendering `matches: true`, run a **clean rebuild +
redeploy** so the on-chain hash and the tracked `build-info.json` agree.

This document is the exact sequence. Total time: ~10 minutes on a Linux box
(or WSL Ubuntu) with the Solana toolchain installed.

---

## Pre-flight (one-time)

```bash
# Solana CLI 2.x (Agave)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Anchor 0.31.1
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.31.1
avm use 0.31.1

# Confirm
solana --version       # should be 2.2.x or higher
anchor --version       # should be anchor-cli 0.31.1
cargo build-sbf --version
```

## Devnet config

```bash
solana config set --url devnet
solana balance              # need ≥ 1 SOL for redeploy
# top up if needed:
solana airdrop 2
```

## Clean build + capture hash

```bash
cd programs/settle-agent-card
rm -rf target/deploy

anchor build

# Verify the build-info file got generated:
cat target/deploy/build-info.json
# Expected output (your hash will differ):
# {
#   "sha256": "<NEW_BUILD_HASH>",
#   "size_bytes": ...,
#   "commit": "<git commit at build time>",
#   "dirty": false,           ← MUST be false; commit any uncommitted edits first
#   "built_at": "...",
#   "builder": { ... }
# }
```

If `dirty: true`, **stop**. Commit your work first, then re-run `anchor build`.
A dirty build defeats the entire reproducibility story.

## Redeploy to devnet

```bash
# Confirm the deployed program ID matches what's in lib.rs declare_id!()
grep declare_id programs/settle-agent-card/src/lib.rs
# Should print: declare_id!("HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD");

# Deploy
anchor deploy --provider.cluster devnet

# This redeploys the .so file at the existing program address. The new
# bytecode replaces the old. Cost: ~1-2 SOL.
```

## Track the build-info.json so Vercel ships it

```bash
# From the repo root
git add -f programs/settle-agent-card/target/deploy/build-info.json

# Verify .gitignore exception will work:
git check-ignore -v programs/settle-agent-card/target/deploy/build-info.json
# If gitignored, add an exception to .gitignore:
echo '!programs/settle-agent-card/target/deploy/build-info.json' >> .gitignore
git add .gitignore programs/settle-agent-card/target/deploy/build-info.json

git commit -m "chore: track build-info.json for /verify-build proof"
git push
```

## Verify the live endpoint

After Vercel redeploys (~3 min):

```bash
curl -sS https://use-settle.vercel.app/api/verify-build | python -m json.tool
```

Expected:

```json
{
  "ok": true,
  "program_id": "HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD",
  "on_chain": {
    "sha256": "<DEPLOYED_HASH>",
    ...
  },
  "claimed": {
    "sha256": "<DEPLOYED_HASH>",   ← same as on_chain
    "commit": "<your commit>",
    "built_at": "...",
    ...
  },
  "matches": true                   ← the win
}
```

Visit `https://use-settle.vercel.app/verify-build` to see it rendered.

## Why this matters for the hackathon submission

This is the only verifiable proof a judge can do in 30 seconds that the
Solana program they see deployed is the same code as the one in the
GitHub repo. Stripe can't show this. Helio can't show this. x402 raw
implementations can't show this. **The combination of `pnpm demo:parity`
(source → hash) + `/verify-build` (source → bytecode → on-chain hash) is
a complete trust chain that no other Solana hackathon submission has.**

When `matches: true` is live, mention it everywhere:

- README header strip
- Demo video (5-second screen recording of `/verify-build`)
- Pitch deck "proof" slide
- Twitter announcement thread
- Colosseum form's "anything else judges should know"
