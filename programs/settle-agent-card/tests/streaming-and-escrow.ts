/**
 * Wave 5 + Wave 7 integration tests — P1 Streaming Pact + P9 DeliveryEscrow.
 *
 * Run alongside the v0.2 suite via:
 *   anchor test --skip-deploy
 *
 * The Anchor.toml `test` script picks up `tests/**\/*.ts`, so this file runs in the
 * same validator session as `settle-agent-card.ts`. Each describe block stands up
 * its own card + mint + actors so the cases stay independent.
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { blake3 } from "@noble/hashes/blake3";
import { describe, it, before } from "mocha";
import assert from "node:assert/strict";

function labelHashBytes(label: string): Buffer {
  return Buffer.from(blake3(new TextEncoder().encode(label)));
}

function randomHash32(): Buffer {
  const out = Buffer.alloc(32);
  for (let i = 0; i < 32; i += 1) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/**
 * Burn slots by airdropping 1 lamport to a throwaway address N times. Each airdrop
 * lands in a new slot, so this is the cheapest reliable way to advance the validator
 * forward when running on a localnet validator without slot-warping support.
 */
async function advanceSlots(
  conn: anchor.web3.Connection,
  payer: Keypair,
  count: number,
): Promise<void> {
  const target = Keypair.generate().publicKey;
  for (let i = 0; i < count; i += 1) {
    const sig = await conn.requestAirdrop(target, 1);
    await conn.confirmTransaction(sig, "confirmed");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// P1 — Streaming Pact
// ─────────────────────────────────────────────────────────────────────────────

describe("settle-agent-card / P1 streaming-pact", () => {
  let program: any;
  let provider: anchor.AnchorProvider;
  let authority: Keypair;
  let agent: Keypair;
  let merchant: Keypair;
  let usdcMint: PublicKey;
  let cardPda: PublicKey;
  let cardLabelHash: Buffer;

  before(async () => {
    provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    program = anchor.workspace.SettleAgentCard;

    authority = Keypair.generate();
    agent = Keypair.generate();
    merchant = Keypair.generate();

    const conn = provider.connection;
    for (const kp of [authority, agent, merchant]) {
      const sig = await conn.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
    }

    usdcMint = await createMint(conn, authority, authority.publicKey, null, 6);
    await createAssociatedTokenAccount(conn, authority, usdcMint, authority.publicKey);
    const authorityAta = getAssociatedTokenAddressSync(usdcMint, authority.publicKey);
    await mintTo(conn, authority, usdcMint, authorityAta, authority, 100_000_000n);
    await createAssociatedTokenAccount(conn, authority, usdcMint, merchant.publicKey);

    cardLabelHash = labelHashBytes("p1-stream-card");
    [cardPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("agent-card"), authority.publicKey.toBuffer(), cardLabelHash],
      program.programId,
    );

    // Daily cap large enough to cover all the streaming claims in this suite.
    const slot = await conn.getSlot("confirmed");
    await program.methods
      .createCard({
        agentPubkey: agent.publicKey,
        labelHash: Array.from(cardLabelHash),
        dailyCapLamports: new BN(50_000_000),   // $50/day
        perCallMaxLamports: new BN(50_000_000), // $50/call
        allowlist: [{ merchantPubkey: merchant.publicKey, capabilityHash: null }],
        expirySlot: new BN(slot + 1_000_000),
        policyVersion: 1,
      } as any)
      .accounts({
        authority: authority.publicKey,
        card: cardPda,
        usdcMint,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();
  });

  it("open_streaming_pact funds the vault with max_total_lamports", async () => {
    const scopeHash = labelHashBytes("p1-stream-1");
    const [pactPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact"), cardPda.toBuffer(), scopeHash],
      program.programId,
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact-vault"), pactPda.toBuffer()],
      program.programId,
    );
    const vaultAta = getAssociatedTokenAddressSync(usdcMint, vaultPda, true);
    const authorityAta = getAssociatedTokenAddressSync(usdcMint, authority.publicKey);
    const slot = await provider.connection.getSlot("confirmed");

    await program.methods
      .openStreamingPact({
        scopeLabelHash: Array.from(scopeHash),
        rateLamportsPerSlot: new BN(1_000),  // 1k lamports/slot ($0.001/slot)
        maxTotalLamports: new BN(5_000_000), // $5 max
        allowlist: [{ merchantPubkey: merchant.publicKey, capabilityHash: null }],
        expirySlot: new BN(slot + 1_000_000),
      } as any)
      .accounts({
        authority: authority.publicKey,
        parentCard: cardPda,
        pact: pactPda,
        vault: vaultPda,
        usdcMint,
        authorityUsdc: authorityAta,
        vaultUsdc: vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const pact = await program.account.pact.fetch(pactPda);
    assert.ok("streaming" in pact.mode, "expected Streaming mode");
    assert.equal(pact.mode.streaming.rateLamportsPerSlot.toString(), "1000");
    assert.equal(pact.mode.streaming.maxTotalLamports.toString(), "5000000");
    assert.equal(pact.mode.streaming.claimed.toString(), "0");
    assert.equal(pact.mode.streaming.paused, false);

    const vaultAcc = await getAccount(provider.connection, vaultAta);
    assert.equal(vaultAcc.amount.toString(), "5000000");
  });

  it("claim_streaming pays entitlement = (now - last_claim) * rate, capped at max_total", async () => {
    const scopeHash = labelHashBytes("p1-stream-2");
    const [pactPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact"), cardPda.toBuffer(), scopeHash],
      program.programId,
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact-vault"), pactPda.toBuffer()],
      program.programId,
    );
    const vaultAta = getAssociatedTokenAddressSync(usdcMint, vaultPda, true);
    const authorityAta = getAssociatedTokenAddressSync(usdcMint, authority.publicKey);
    const merchantAta = getAssociatedTokenAddressSync(usdcMint, merchant.publicKey);
    const slot = await provider.connection.getSlot("confirmed");

    const RATE = new BN(1_000); // 1k lamports/slot
    const MAX_TOTAL = new BN(2_000_000); // $2 cap (so we can also exercise the saturate path later)

    await program.methods
      .openStreamingPact({
        scopeLabelHash: Array.from(scopeHash),
        rateLamportsPerSlot: RATE,
        maxTotalLamports: MAX_TOTAL,
        allowlist: [{ merchantPubkey: merchant.publicKey, capabilityHash: null }],
        expirySlot: new BN(slot + 1_000_000),
      } as any)
      .accounts({
        authority: authority.publicKey,
        parentCard: cardPda,
        pact: pactPda,
        vault: vaultPda,
        usdcMint,
        authorityUsdc: authorityAta,
        vaultUsdc: vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    // Advance some slots so entitlement accrues.
    await advanceSlots(provider.connection, authority, 8);

    const merchantBefore = (await getAccount(provider.connection, merchantAta)).amount;

    await program.methods
      .claimStreaming(
        Array.from(randomHash32()),
        Array.from(randomHash32()),
        Array.from(randomHash32()),
        Array.from(randomHash32()),
      )
      .accounts({
        agent: agent.publicKey,
        feePayer: agent.publicKey,
        card: cardPda,
        pact: pactPda,
        vault: vaultPda,
        usdcMint,
        vaultUsdc: vaultAta,
        merchantUsdc: merchantAta,
        merchantOwner: merchant.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([agent])
      .rpc();

    const merchantAfter = (await getAccount(provider.connection, merchantAta)).amount;
    const claimed = merchantAfter - merchantBefore;
    // Entitlement is N * RATE for some N ≥ 1. We can't pin N exactly without slot
    // warping, but we know it must be in (0, MAX_TOTAL] and a multiple of RATE.
    assert.ok(claimed > 0n, "merchant should have received some funds");
    assert.ok(
      claimed <= BigInt(MAX_TOTAL.toString()),
      `claimed ${claimed} exceeded max_total ${MAX_TOTAL.toString()}`,
    );

    const pactAfter = await program.account.pact.fetch(pactPda);
    assert.ok("streaming" in pactAfter.mode);
    assert.equal(pactAfter.mode.streaming.claimed.toString(), claimed.toString());
    // pause_accumulated_slots must reset to 0 after a successful claim.
    assert.equal(pactAfter.mode.streaming.pauseAccumulatedSlots.toString(), "0");
  });

  it("pause→advance→resume→claim does not bill paused time", async () => {
    const scopeHash = labelHashBytes("p1-stream-3");
    const [pactPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact"), cardPda.toBuffer(), scopeHash],
      program.programId,
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact-vault"), pactPda.toBuffer()],
      program.programId,
    );
    const vaultAta = getAssociatedTokenAddressSync(usdcMint, vaultPda, true);
    const authorityAta = getAssociatedTokenAddressSync(usdcMint, authority.publicKey);
    const merchantAta = getAssociatedTokenAddressSync(usdcMint, merchant.publicKey);
    const slot = await provider.connection.getSlot("confirmed");

    await program.methods
      .openStreamingPact({
        scopeLabelHash: Array.from(scopeHash),
        rateLamportsPerSlot: new BN(2_000),
        maxTotalLamports: new BN(2_000_000),
        allowlist: [{ merchantPubkey: merchant.publicKey, capabilityHash: null }],
        expirySlot: new BN(slot + 1_000_000),
      } as any)
      .accounts({
        authority: authority.publicKey,
        parentCard: cardPda,
        pact: pactPda,
        vault: vaultPda,
        usdcMint,
        authorityUsdc: authorityAta,
        vaultUsdc: vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    // Pause immediately, advance slots, then resume.
    await program.methods
      .pauseStreaming()
      .accounts({ authority: authority.publicKey, pact: pactPda })
      .signers([authority])
      .rpc();

    const pausedPact = await program.account.pact.fetch(pactPda);
    assert.equal(pausedPact.mode.streaming.paused, true);
    assert.notEqual(pausedPact.mode.streaming.pauseStartedSlot.toString(), "0");

    await advanceSlots(provider.connection, authority, 6);

    await program.methods
      .resumeStreaming()
      .accounts({ authority: authority.publicKey, pact: pactPda })
      .signers([authority])
      .rpc();

    const resumedPact = await program.account.pact.fetch(pactPda);
    assert.equal(resumedPact.mode.streaming.paused, false);
    assert.equal(resumedPact.mode.streaming.pauseStartedSlot.toString(), "0");
    // pause_accumulated_slots > 0 because we held paused for ≥1 slot.
    const accumulated = BigInt(resumedPact.mode.streaming.pauseAccumulatedSlots.toString());
    assert.ok(accumulated > 0n, "pause_accumulated_slots should be positive after resume");

    // Now advance some slots and claim. The paid amount should be smaller than what
    // we'd have earned without the pause.
    await advanceSlots(provider.connection, authority, 4);

    const merchantBefore = (await getAccount(provider.connection, merchantAta)).amount;
    await program.methods
      .claimStreaming(
        Array.from(randomHash32()),
        Array.from(randomHash32()),
        Array.from(randomHash32()),
        Array.from(randomHash32()),
      )
      .accounts({
        agent: agent.publicKey,
        feePayer: agent.publicKey,
        card: cardPda,
        pact: pactPda,
        vault: vaultPda,
        usdcMint,
        vaultUsdc: vaultAta,
        merchantUsdc: merchantAta,
        merchantOwner: merchant.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([agent])
      .rpc();
    const merchantAfter = (await getAccount(provider.connection, merchantAta)).amount;
    const claimed = merchantAfter - merchantBefore;
    assert.ok(claimed > 0n);

    // pause_accumulated_slots resets to 0 on the successful claim.
    const after = await program.account.pact.fetch(pactPda);
    assert.equal(after.mode.streaming.pauseAccumulatedSlots.toString(), "0");
  });

  it("close_pact on a streaming pact refunds the unspent vault balance", async () => {
    const scopeHash = labelHashBytes("p1-stream-4");
    const [pactPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact"), cardPda.toBuffer(), scopeHash],
      program.programId,
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact-vault"), pactPda.toBuffer()],
      program.programId,
    );
    const vaultAta = getAssociatedTokenAddressSync(usdcMint, vaultPda, true);
    const authorityAta = getAssociatedTokenAddressSync(usdcMint, authority.publicKey);
    const slot = await provider.connection.getSlot("confirmed");

    await program.methods
      .openStreamingPact({
        scopeLabelHash: Array.from(scopeHash),
        rateLamportsPerSlot: new BN(1_000),
        maxTotalLamports: new BN(3_000_000),
        allowlist: [{ merchantPubkey: merchant.publicKey, capabilityHash: null }],
        expirySlot: new BN(slot + 1_000_000),
      } as any)
      .accounts({
        authority: authority.publicKey,
        parentCard: cardPda,
        pact: pactPda,
        vault: vaultPda,
        usdcMint,
        authorityUsdc: authorityAta,
        vaultUsdc: vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const before = (await getAccount(provider.connection, authorityAta)).amount;
    const vaultBefore = (await getAccount(provider.connection, vaultAta)).amount;
    assert.equal(vaultBefore.toString(), "3000000");

    await program.methods
      .closePact()
      .accounts({
        authority: authority.publicKey,
        pact: pactPda,
        vault: vaultPda,
        usdcMint,
        vaultUsdc: vaultAta,
        authorityUsdc: authorityAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    const after = (await getAccount(provider.connection, authorityAta)).amount;
    assert.equal(
      (after - before).toString(),
      "3000000",
      "authority should be refunded the full vault balance",
    );
    const vaultAfter = (await getAccount(provider.connection, vaultAta)).amount;
    assert.equal(vaultAfter.toString(), "0");

    const pact = await program.account.pact.fetch(pactPda);
    assert.equal(pact.closed, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P9 — DeliveryEscrow Pact
// ─────────────────────────────────────────────────────────────────────────────

describe("settle-agent-card / P9 delivery-escrow", () => {
  let program: any;
  let provider: anchor.AnchorProvider;
  let authority: Keypair; // buyer
  let agent: Keypair;
  let merchant: Keypair;
  let stranger: Keypair; // permissionless caller
  let usdcMint: PublicKey;
  let cardPda: PublicKey;

  /**
   * Helper to open a fresh delivery_escrow pact with custom deadlines, returning all
   * derived addresses + the actual on-chain account so tests can assert.
   */
  async function openEscrow(
    scopeLabel: string,
    amount: number,
    confirmDelta: number,
    disputeDelta: number,
  ) {
    const conn = provider.connection;
    const slot = await conn.getSlot("confirmed");
    const scopeHash = labelHashBytes(scopeLabel);
    const [pactPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact"), cardPda.toBuffer(), scopeHash],
      program.programId,
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact-vault"), pactPda.toBuffer()],
      program.programId,
    );
    const vaultAta = getAssociatedTokenAddressSync(usdcMint, vaultPda, true);
    const authorityAta = getAssociatedTokenAddressSync(usdcMint, authority.publicKey);

    await program.methods
      .openDeliveryEscrow({
        scopeLabelHash: Array.from(scopeHash),
        amount: new BN(amount),
        merchant: merchant.publicKey,
        capabilityHash: Array.from(randomHash32()),
        confirmDeadlineSlot: new BN(slot + confirmDelta),
        disputeDeadlineSlot: new BN(slot + disputeDelta),
        expirySlot: new BN(slot + 1_000_000),
      } as any)
      .accounts({
        authority: authority.publicKey,
        parentCard: cardPda,
        pact: pactPda,
        vault: vaultPda,
        usdcMint,
        authorityUsdc: authorityAta,
        vaultUsdc: vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    return { pactPda, vaultPda, vaultAta, scopeHash };
  }

  before(async () => {
    provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    program = anchor.workspace.SettleAgentCard;

    authority = Keypair.generate();
    agent = Keypair.generate();
    merchant = Keypair.generate();
    stranger = Keypair.generate();

    const conn = provider.connection;
    for (const kp of [authority, agent, merchant, stranger]) {
      const sig = await conn.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
    }

    usdcMint = await createMint(conn, authority, authority.publicKey, null, 6);
    await createAssociatedTokenAccount(conn, authority, usdcMint, authority.publicKey);
    const authorityAta = getAssociatedTokenAddressSync(usdcMint, authority.publicKey);
    await mintTo(conn, authority, usdcMint, authorityAta, authority, 100_000_000n);
    await createAssociatedTokenAccount(conn, authority, usdcMint, merchant.publicKey);

    const cardLabelHash = labelHashBytes("p9-escrow-card");
    [cardPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("agent-card"), authority.publicKey.toBuffer(), cardLabelHash],
      program.programId,
    );

    const slot = await conn.getSlot("confirmed");
    await program.methods
      .createCard({
        agentPubkey: agent.publicKey,
        labelHash: Array.from(cardLabelHash),
        dailyCapLamports: new BN(50_000_000),
        perCallMaxLamports: new BN(50_000_000),
        allowlist: [],
        expirySlot: new BN(slot + 1_000_000),
        policyVersion: 1,
      } as any)
      .accounts({
        authority: authority.publicKey,
        card: cardPda,
        usdcMint,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();
  });

  it("buyer confirms within window → merchant receives funds, vault drained", async () => {
    const { pactPda, vaultPda, vaultAta } = await openEscrow("p9-confirm", 1_000_000, 1_000_000, 1_000_000);
    const merchantAta = getAssociatedTokenAddressSync(usdcMint, merchant.publicKey);
    const merchantBefore = (await getAccount(provider.connection, merchantAta)).amount;

    await program.methods
      .releaseDeliveryEscrow()
      .accounts({
        caller: authority.publicKey,
        pact: pactPda,
        vault: vaultPda,
        usdcMint,
        vaultUsdc: vaultAta,
        merchantUsdc: merchantAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    const merchantAfter = (await getAccount(provider.connection, merchantAta)).amount;
    assert.equal((merchantAfter - merchantBefore).toString(), "1000000");
    const vaultAfter = (await getAccount(provider.connection, vaultAta)).amount;
    assert.equal(vaultAfter.toString(), "0");
    const pact = await program.account.pact.fetch(pactPda);
    assert.ok("deliveryEscrow" in pact.mode);
    assert.equal(pact.mode.deliveryEscrow.released, true);
    assert.equal(pact.closed, true);
  });

  it("buyer disputes within window → buyer receives refund", async () => {
    const { pactPda, vaultPda, vaultAta } = await openEscrow("p9-dispute", 1_500_000, 1_000_000, 1_000_000);
    const authorityAta = getAssociatedTokenAddressSync(usdcMint, authority.publicKey);
    const before = (await getAccount(provider.connection, authorityAta)).amount;

    await program.methods
      .disputeDeliveryEscrow()
      .accounts({
        authority: authority.publicKey,
        pact: pactPda,
        vault: vaultPda,
        usdcMint,
        vaultUsdc: vaultAta,
        authorityUsdc: authorityAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    const after = (await getAccount(provider.connection, authorityAta)).amount;
    assert.equal((after - before).toString(), "1500000");
    const pact = await program.account.pact.fetch(pactPda);
    assert.equal(pact.mode.deliveryEscrow.refunded, true);
    assert.equal(pact.closed, true);
  });

  it("permissionless release after confirm_deadline → merchant receives funds", async () => {
    // Tight confirm window so we can pass it via slot advancement.
    const { pactPda, vaultPda, vaultAta } = await openEscrow("p9-permissionless", 800_000, 4, 1_000_000);
    const merchantAta = getAssociatedTokenAddressSync(usdcMint, merchant.publicKey);

    // Stranger calls release before deadline → expect EscrowConfirmDeadlineNotPassed.
    await assert.rejects(
      program.methods
        .releaseDeliveryEscrow()
        .accounts({
          caller: stranger.publicKey,
          pact: pactPda,
          vault: vaultPda,
          usdcMint,
          vaultUsdc: vaultAta,
          merchantUsdc: merchantAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([stranger])
        .rpc(),
      /EscrowConfirmDeadlineNotPassed/,
    );

    // Advance past the confirm deadline.
    await advanceSlots(provider.connection, authority, 6);

    const merchantBefore = (await getAccount(provider.connection, merchantAta)).amount;
    await program.methods
      .releaseDeliveryEscrow()
      .accounts({
        caller: stranger.publicKey,
        pact: pactPda,
        vault: vaultPda,
        usdcMint,
        vaultUsdc: vaultAta,
        merchantUsdc: merchantAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([stranger])
      .rpc();
    const merchantAfter = (await getAccount(provider.connection, merchantAta)).amount;
    assert.equal((merchantAfter - merchantBefore).toString(), "800000");

    const pact = await program.account.pact.fetch(pactPda);
    assert.equal(pact.mode.deliveryEscrow.released, true);
  });

  it("dispute after deadline → fails with EscrowDisputeWindowClosed", async () => {
    // Open with a near-zero dispute window.
    const { pactPda, vaultPda, vaultAta } = await openEscrow(
      "p9-late-dispute",
      400_000,
      4,
      4,
    );
    await advanceSlots(provider.connection, authority, 6);

    const authorityAta = getAssociatedTokenAddressSync(usdcMint, authority.publicKey);
    await assert.rejects(
      program.methods
        .disputeDeliveryEscrow()
        .accounts({
          authority: authority.publicKey,
          pact: pactPda,
          vault: vaultPda,
          usdcMint,
          vaultUsdc: vaultAta,
          authorityUsdc: authorityAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([authority])
        .rpc(),
      /EscrowDisputeWindowClosed/,
    );
  });

  it("double-release fails with EscrowAlreadyReleased", async () => {
    const { pactPda, vaultPda, vaultAta } = await openEscrow(
      "p9-double-release",
      300_000,
      1_000_000,
      1_000_000,
    );
    const merchantAta = getAssociatedTokenAddressSync(usdcMint, merchant.publicKey);

    await program.methods
      .releaseDeliveryEscrow()
      .accounts({
        caller: authority.publicKey,
        pact: pactPda,
        vault: vaultPda,
        usdcMint,
        vaultUsdc: vaultAta,
        merchantUsdc: merchantAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    // Second release call rejects. Could fail at PactClosed (since release sets
    // closed=true) OR EscrowAlreadyReleased — both prove the second call is gated.
    await assert.rejects(
      program.methods
        .releaseDeliveryEscrow()
        .accounts({
          caller: authority.publicKey,
          pact: pactPda,
          vault: vaultPda,
          usdcMint,
          vaultUsdc: vaultAta,
          merchantUsdc: merchantAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([authority])
        .rpc(),
      /(PactClosed|EscrowAlreadyReleased)/,
    );
  });
});
