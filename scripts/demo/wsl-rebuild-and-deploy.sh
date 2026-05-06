#!/usr/bin/env bash
# Clean rebuild settle-agent-card + redeploy to devnet, then capture
# build-info.json so /verify-build returns match=true.
#
# Run from WSL Ubuntu where the toolchain is installed:
#   bash scripts/demo/wsl-rebuild-and-deploy.sh
set -euo pipefail

source "$HOME/.cargo/env" 2>/dev/null || true
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"

REPO="/mnt/c/Users/prate/Downloads/solana/settle-protocol"
PROG_DIR="$REPO/programs/settle-agent-card"

echo "=== Repo state ==="
cd "$REPO"
git status --porcelain | head -10 || true
echo ""
echo "Current commit: $(git rev-parse HEAD)"
echo ""

echo "=== Switching to anchor 0.31.1 ==="
avm use 0.31.1
anchor --version
solana --version
echo ""

echo "=== Clean previous build ==="
cd "$PROG_DIR"
rm -rf target/deploy target/debug target/release
echo "Cleaned target/"
echo ""

echo "=== anchor build ==="
# This generates target/deploy/settle_agent_card.so and build-info.json
anchor build 2>&1 | tail -20
echo ""

echo "=== Build artifacts ==="
ls -la "$PROG_DIR/target/deploy/"
echo ""

echo "=== build-info.json ==="
cat "$PROG_DIR/target/deploy/build-info.json" || true
echo ""

echo "=== On-chain hash before deploy ==="
SCRIPT="$REPO/scripts/compute-program-hash.ts"
if [ -f "$SCRIPT" ]; then
  echo "(see /api/verify-build on production for current on-chain hash)"
fi

echo ""
echo "=== Deploy to devnet ==="
solana balance
echo "Deploying... this can take 60-120s and uses ~1-2 SOL"
anchor deploy --provider.cluster devnet 2>&1 | tail -10
echo ""

echo "=== Done ==="
echo "Run the next step (track build-info.json + push) from PowerShell:"
echo "  .\\scripts\\demo\\wsl-track-and-push.ps1"
