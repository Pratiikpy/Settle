#!/usr/bin/env bash
set -euo pipefail

# ───────────────────────────────────────────────────────────────────────────
# Settle — devnet deployment script
#
# Pre-reqs (one-time):
#   - solana CLI installed (sh -c "$(curl -sSfL https://release.solana.com/v2.0.21/install)")
#   - Anchor installed (cargo install --git https://github.com/coral-xyz/anchor avm --locked --force; avm install 0.31.1; avm use 0.31.1)
#   - solana-keygen new -o ~/.config/solana/id.json
#   - solana airdrop 5 --url devnet
#
# Usage:
#   bash scripts/deploy-devnet.sh
# ───────────────────────────────────────────────────────────────────────────

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "${CYAN}▸ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }

cd "$(dirname "$0")/.."

# ── 1. Sanity checks ──────────────────────────────────────────────────────
step "Checking toolchain…"
command -v solana >/dev/null || fail "solana CLI not found"
command -v anchor >/dev/null || fail "anchor CLI not found"
command -v pnpm >/dev/null   || fail "pnpm not found"
ok "Toolchain present"

step "Setting Solana config to devnet…"
solana config set --url https://api.devnet.solana.com >/dev/null
ok "Devnet"

step "Checking deployer balance…"
BAL=$(solana balance --url devnet | awk '{print $1}')
echo "  Balance: ${BAL} SOL"
# awk-based comparison so we don't depend on `bc` (not bundled with Git Bash on Windows).
LOW=$(awk -v b="${BAL}" 'BEGIN{print (b<4)?"1":"0"}')
if [ "${LOW}" = "1" ]; then
  echo "  Topping up via airdrop…"
  solana airdrop 2 --url devnet || true
fi

# ── 2. Generate program keypair if missing ─────────────────────────────────
PROG_KEYPAIR="programs/settle-agent-card/target/deploy/settle_agent_card-keypair.json"
if [ ! -f "${PROG_KEYPAIR}" ]; then
  step "Generating program keypair…"
  mkdir -p "$(dirname "${PROG_KEYPAIR}")"
  solana-keygen new --no-bip39-passphrase -o "${PROG_KEYPAIR}"
  ok "New keypair at ${PROG_KEYPAIR}"
fi

PROG_ID=$(solana-keygen pubkey "${PROG_KEYPAIR}")
step "Program ID: ${PROG_ID}"

# ── 3. Update declare_id! and Anchor.toml if needed ────────────────────────
LIB_RS="programs/settle-agent-card/programs/settle-agent-card/src/lib.rs"
if grep -q "SettLe1111111111111111111111111111111111111" "${LIB_RS}"; then
  step "Patching declare_id! in lib.rs…"
  sed -i.bak "s/SettLe1111111111111111111111111111111111111/${PROG_ID}/g" "${LIB_RS}"
  rm "${LIB_RS}.bak"
  ok "Patched"
fi

ANCHOR_TOML="programs/settle-agent-card/Anchor.toml"
if grep -q "SettLe1111111111111111111111111111111111111" "${ANCHOR_TOML}"; then
  step "Patching Anchor.toml…"
  sed -i.bak "s/SettLe1111111111111111111111111111111111111/${PROG_ID}/g" "${ANCHOR_TOML}"
  rm "${ANCHOR_TOML}.bak"
  ok "Patched"
fi

# ── 4. Anchor build ────────────────────────────────────────────────────────
step "anchor build…"
( cd programs/settle-agent-card && anchor build )
ok "Build succeeded"

# ── 5. Deploy ──────────────────────────────────────────────────────────────
step "anchor deploy --provider.cluster devnet…"
( cd programs/settle-agent-card && anchor deploy --provider.cluster devnet )
ok "Deployed"

# ── 6. Verify ──────────────────────────────────────────────────────────────
step "Verifying program account…"
solana program show "${PROG_ID}" --url devnet | head -20
ok "Verified"

# ── 7. Codama codegen ──────────────────────────────────────────────────────
if [ -f "packages/sdk/codama.config.ts" ]; then
  step "Generating @settle/sdk client via Codama…"
  pnpm --filter @settle/sdk codegen || echo "Codegen optional — skipping if it fails"
fi

# ── 8. Print env vars to copy ──────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
ok "Deploy complete."
echo ""
echo "Add to .env.local:"
echo ""
echo "  NEXT_PUBLIC_SETTLE_PROGRAM_ID=${PROG_ID}"
echo "  SETTLE_AGENT_CARD_PROGRAM_ID=${PROG_ID}"
echo ""
echo "Solscan: https://solscan.io/account/${PROG_ID}?cluster=devnet"
echo ""
