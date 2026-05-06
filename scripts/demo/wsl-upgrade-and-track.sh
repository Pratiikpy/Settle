#!/usr/bin/env bash
# Upgrade-deploy (cheap path) + generate build-info.json + verify hashes match.
#
# Run from WSL after wsl-rebuild-and-deploy.sh completed the build step:
#   bash scripts/demo/wsl-upgrade-and-track.sh
set -euo pipefail

source "$HOME/.cargo/env" 2>/dev/null || true
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"

REPO="/mnt/c/Users/prate/Downloads/solana/settle-protocol"
PROG_DIR="$REPO/programs/settle-agent-card"
SO_FILE="$PROG_DIR/target/deploy/settle_agent_card.so"
PROGRAM_ID="HU4piq8bwYFast81U6e8huYVb8JaY44chWE8QVGT77nD"
BUILD_INFO="$PROG_DIR/target/deploy/build-info.json"

echo "=== Pre-flight ==="
[ -f "$SO_FILE" ] || { echo "ERROR: $SO_FILE not found. Run wsl-rebuild-and-deploy.sh first."; exit 1; }
ls -la "$SO_FILE"
echo ""

echo "=== Compute local sha256 of the new .so ==="
LOCAL_HASH=$(sha256sum "$SO_FILE" | awk '{print $1}')
SIZE_BYTES=$(stat -c%s "$SO_FILE")
echo "sha256:    $LOCAL_HASH"
echo "size:      $SIZE_BYTES bytes"
echo ""

echo "=== Generate build-info.json ==="
COMMIT=$(cd "$REPO" && git rev-parse HEAD)
DIRTY=$(cd "$REPO" && [ -z "$(git status --porcelain --untracked-files=no)" ] && echo "false" || echo "true")
BUILT_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HOSTNAME=$(hostname)
ARCH=$(uname -m)

cat > "$BUILD_INFO" <<EOF
{
  "sha256": "$LOCAL_HASH",
  "size_bytes": $SIZE_BYTES,
  "commit": "$COMMIT",
  "dirty": $DIRTY,
  "built_at": "$BUILT_AT",
  "builder": {
    "hostname": "$HOSTNAME",
    "platform": "linux-wsl",
    "arch": "$ARCH",
    "solana": "$(solana --version | awk '{print $2}')",
    "anchor": "$(anchor --version | awk '{print $2}')"
  }
}
EOF

cat "$BUILD_INFO"
echo ""

if [ "$DIRTY" = "true" ]; then
  echo "WARNING: working tree is dirty. The build-info.json claims dirty: true,"
  echo "which means /verify-build will still match (hash matches the deployed"
  echo "binary), but a careful reviewer will see we built off uncommitted edits."
  echo "If this matters, commit your work first and re-run this script."
fi
echo ""

echo "=== On-chain hash before upgrade (for comparison) ==="
ON_CHAIN_BEFORE=$(curl -sS https://use-settle.vercel.app/api/verify-build | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('on_chain',{}).get('sha256','?'))")
echo "on-chain (before upgrade): $ON_CHAIN_BEFORE"
echo ""

echo "=== Solana balance ==="
solana balance
echo ""

echo "=== Upgrade-deploy (cheap path: ~0.001 SOL) ==="
# program deploy --program-id uses the existing ProgramData buffer.
# Cost is just tx fee (no new ProgramData allocation).
solana program deploy "$SO_FILE" \
  --program-id "$PROGRAM_ID" \
  --keypair /home/zkharsh/.config/solana/id.json \
  --url devnet 2>&1 | tail -10
echo ""

echo "=== Wait 5s for chain to confirm ==="
sleep 5

echo "=== Re-fetch on-chain hash and compare ==="
ON_CHAIN_AFTER=$(curl -sS https://use-settle.vercel.app/api/verify-build | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('on_chain',{}).get('sha256','?'))")
echo "local:                   $LOCAL_HASH"
echo "on-chain (after upgrade): $ON_CHAIN_AFTER"
echo ""

if [ "$LOCAL_HASH" = "$ON_CHAIN_AFTER" ]; then
  echo "✓ MATCH — local build hash == on-chain bytecode hash."
  echo "  /verify-build will return matches: true after Vercel redeploys"
  echo "  the static build-info.json (next git push)."
else
  echo "✗ Hashes differ. /api/verify-build strips a 13/45-byte ProgramData header"
  echo "  before hashing the bytecode. The local sha256 hashes the raw .so file."
  echo "  This MAY be expected — the route's on_chain.sha256 is post-strip."
fi
echo ""

echo "=== Done. Next step: track build-info.json in git ==="
echo "From PowerShell:"
echo "  git add programs/settle-agent-card/target/deploy/build-info.json"
echo "  git commit -m 'chore: track build-info.json (verify-build proof)'"
echo "  git push"
