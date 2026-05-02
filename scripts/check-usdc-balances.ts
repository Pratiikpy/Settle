// One-shot tool: prints SOL + USDC balance for each operator wallet on devnet.
// Usage: pnpm exec tsx scripts/check-usdc-balances.mjs
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

const cluster = process.env.SETTLE_CLUSTER ?? "devnet";
const heliusKey = process.env.HELIUS_API_KEY;
const rpc = heliusKey
  ? `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`
  : `https://api.${cluster}.solana.com`;
const conn = new Connection(rpc, "confirmed");

const usdcMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

const wallets = {
  DEPLOYER: process.env.SETTLE_DEPLOYER_PUBKEY,
  FACILITATOR: process.env.SETTLE_FACILITATOR_PUBKEY,
  BADGE_AUTHORITY: process.env.SETTLE_BADGE_AUTHORITY_PUBKEY,
  ZK_RECEIPT_AUTHORITY: process.env.SETTLE_ZK_RECEIPT_AUTHORITY_PUBKEY,
};

async function main() {
  console.log(`cluster=${cluster}  usdc_mint=${usdcMint.toBase58()}\n`);
  for (const [name, addr] of Object.entries(wallets)) {
    if (!addr) {
      console.log(`${name.padEnd(22)} <env not set>`);
      continue;
    }
    const owner = new PublicKey(addr);
    const sol = await conn.getBalance(owner, "confirmed");
    const ata = await getAssociatedTokenAddress(usdcMint, owner);
    let usdc = "no ATA";
    try {
      const info = await conn.getTokenAccountBalance(ata, "confirmed");
      usdc = `${info.value.uiAmountString} USDC`;
    } catch {
      usdc = "no ATA";
    }
    console.log(
      `${name.padEnd(22)} ${addr.slice(0, 8)}…  SOL=${(sol / 1e9).toFixed(3)}  ${usdc}`,
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
