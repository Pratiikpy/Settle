import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const PACT = new PublicKey("9euC6XVfcYpjXRoJoCxEGKMepXAB9e4S8GLtjrfBCt9d");
const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_SETTLE_PROGRAM_ID ?? process.env.SETTLE_AGENT_CARD_PROGRAM_ID!);
const USDC = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

const [vaultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("pact-vault"), PACT.toBuffer()],
  PROGRAM_ID,
);
const vaultAta = getAssociatedTokenAddressSync(USDC, vaultPda, true);
console.log("vault PDA:", vaultPda.toBase58());
console.log("vault ATA:", vaultAta.toBase58());
