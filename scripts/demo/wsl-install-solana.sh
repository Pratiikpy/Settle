#!/usr/bin/env bash
# WSL one-shot installer for the Solana toolchain needed to clean-rebuild
# the agent-card program and redeploy. Idempotent — safe to re-run.
set -e

source "$HOME/.cargo/env" 2>/dev/null || true
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"

echo "=== Solana CLI (Agave 2.x) ==="
if ! command -v solana >/dev/null; then
  curl -sSfL https://release.anza.xyz/stable/install -o /tmp/anza-install.sh
  sh /tmp/anza-install.sh 2>&1 | tail -5
  export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi
solana --version

echo ""
echo "=== avm + Anchor 0.31.1 ==="
if ! command -v avm >/dev/null; then
  cargo install --git https://github.com/coral-xyz/anchor avm --locked 2>&1 | tail -3
fi
avm install 0.31.1 2>&1 | tail -3
avm use 0.31.1
anchor --version

echo ""
echo "=== Devnet config ==="
solana config set --url devnet 2>&1 | tail -3
solana config get
echo ""
echo "Balance:"
solana balance
