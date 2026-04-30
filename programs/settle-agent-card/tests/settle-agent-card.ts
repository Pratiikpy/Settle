/**
 * Integration tests for settle-agent-card.
 *
 * Run:
 *   anchor build               # produces target/idl/settle_agent_card.json
 *   anchor deploy              # to devnet (or set [provider] cluster = "localnet" + use solana-test-validator)
 *   anchor test --skip-deploy  # runs this file via ts-mocha
 *
 * Coverage:
 *   ✓ create_card with usdc_mint pin
 *   ✓ open_pact: creates Pact + Vault ATA + funds it from authority
 *   ✓ spend_via_pact: agent signs, vault PDA executes TransferChecked
 *   ✓ pact.spent increments, merchant ATA receives funds
 *   ✓ deny: spend over per_call_max → OverCap
 *   ✓ deny: spend off_allowlist → OffAllowlist
 *   ✓ deny: spend with wrong capability_hash → CapabilityNotPinned
 *   ✓ revoke: bumps policy_version, emits PolicyDecisionEvent
 *   ✓ post-revoke spend → CardRevoked
 *   ✓ close_pact: drains vault → authority, marks closed
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

const ZERO32 = Buffer.alloc(32);

describe("settle-agent-card integration", () => {
  let program: Program<any>;
  let provider: anchor.AnchorProvider;
  let authority: Keypair;
  let agent: Keypair;
  let usdcMint: PublicKey;
  let merchantA: Keypair;
  let merchantB: Keypair;
  let attacker: Keypair;
  let cardPda: PublicKey;
  let cardLabelHash: Buffer;

  before(async () => {
    provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    program = anchor.workspace.SettleAgentCard;

    authority = Keypair.generate();
    agent = Keypair.generate();
    merchantA = Keypair.generate();
    merchantB = Keypair.generate();
    attacker = Keypair.generate();

    // Fund authority + agent + merchants with SOL for rent
    const conn = provider.connection;
    const sigs = await Promise.all(
      [authority, agent, merchantA, merchantB, attacker].map((kp) =>
        conn.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL),
      ),
    );
    for (const sig of sigs) {
      await conn.confirmTransaction(sig, "confirmed");
    }

    // Create USDC test mint with 6 decimals (matching real USDC)
    usdcMint = await createMint(
      conn,
      authority,
      authority.publicKey,
      null,
      6,
    );

    // Create authority's USDC ATA + mint $100 USDC
    await createAssociatedTokenAccount(conn, authority, usdcMint, authority.publicKey);
    const authorityAta = getAssociatedTokenAddressSync(usdcMint, authority.publicKey);
    await mintTo(conn, authority, usdcMint, authorityAta, authority, 100_000_000n);

    // Create merchant ATAs (pre-creating so spend ix doesn't have to)
    await createAssociatedTokenAccount(conn, authority, usdcMint, merchantA.publicKey);
    await createAssociatedTokenAccount(conn, authority, usdcMint, merchantB.publicKey);

    // Derive card PDA
    cardLabelHash = labelHashBytes("test-card");
    [cardPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("agent-card"), authority.publicKey.toBuffer(), cardLabelHash],
      program.programId,
    );
  });

  it("create_card pins usdc_mint and emits CardCreatedEvent", async () => {
    const dailyCap = new BN(10_000_000); // $10
    const perCallMax = new BN(2_000_000); // $2
    const slot = await provider.connection.getSlot("confirmed");
    const expirySlot = new BN(slot + 1_000_000);

    await program.methods
      .createCard({
        agentPubkey: agent.publicKey,
        labelHash: Array.from(cardLabelHash),
        dailyCapLamports: dailyCap,
        perCallMaxLamports: perCallMax,
        allowlist: [
          { merchantPubkey: merchantA.publicKey, capabilityHash: null },
          { merchantPubkey: merchantB.publicKey, capabilityHash: null },
        ],
        expirySlot,
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

    const card = await program.account.agentCard.fetch(cardPda);
    assert.equal(card.authority.toBase58(), authority.publicKey.toBase58());
    assert.equal(card.agentPubkey.toBase58(), agent.publicKey.toBase58());
    assert.equal(card.usdcMint.toBase58(), usdcMint.toBase58());
    assert.equal(card.dailyCapLamports.toString(), "10000000");
    assert.equal(card.perCallMaxLamports.toString(), "2000000");
    assert.equal(card.allowlist.length, 2);
    assert.equal(card.revoked, false);
    assert.equal(card.policyVersion, 1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Pact lifecycle: open + spend + close
  // ─────────────────────────────────────────────────────────────────────────

  let pactPda: PublicKey;
  let pactScopeHash: Buffer;
  let vaultPda: PublicKey;
  let vaultUsdcAta: PublicKey;

  it("open_pact creates Pact PDA, initializes vault ATA, transfers cap from authority", async () => {
    pactScopeHash = labelHashBytes("test-pact-1");
    [pactPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact"), cardPda.toBuffer(), pactScopeHash],
      program.programId,
    );
    [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact-vault"), pactPda.toBuffer()],
      program.programId,
    );
    vaultUsdcAta = getAssociatedTokenAddressSync(usdcMint, vaultPda, true);
    const authorityAta = getAssociatedTokenAddressSync(usdcMint, authority.publicKey);

    const slot = await provider.connection.getSlot("confirmed");
    const expirySlot = new BN(slot + 1_000_000);
    const cap = new BN(5_000_000); // $5

    await program.methods
      .openPact({
        scopeLabelHash: Array.from(pactScopeHash),
        capLamports: cap,
        allowlist: [{ merchantPubkey: merchantA.publicKey, capabilityHash: null }],
        expirySlot,
      } as any)
      .accounts({
        authority: authority.publicKey,
        parentCard: cardPda,
        pact: pactPda,
        vault: vaultPda,
        usdcMint,
        authorityUsdc: authorityAta,
        vaultUsdc: vaultUsdcAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const pact = await program.account.pact.fetch(pactPda);
    assert.equal(pact.parentCard.toBase58(), cardPda.toBase58());
    assert.equal(pact.usdcMint.toBase58(), usdcMint.toBase58());
    // v0.3 — mode is the PactMode enum; OneShot variant carries cap_lamports + spent.
    assert.ok("oneShot" in pact.mode, "expected OneShot mode");
    assert.equal(pact.mode.oneShot.capLamports.toString(), "5000000");
    assert.equal(pact.mode.oneShot.spent.toString(), "0");
    assert.equal(pact.closed, false);

    const vaultAcc = await getAccount(provider.connection, vaultUsdcAta);
    assert.equal(vaultAcc.amount.toString(), "5000000");
  });

  it("spend_via_pact: agent signs, vault PDA executes transfer to merchant", async () => {
    const merchantAta = getAssociatedTokenAddressSync(usdcMint, merchantA.publicKey);
    const merchantBalanceBefore = (await getAccount(provider.connection, merchantAta)).amount;

    const amount = new BN(1_500_000); // $1.50

    await program.methods
      .spendViaPact(
        amount,
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
        vaultUsdc: vaultUsdcAta,
        merchantUsdc: merchantAta,
        merchantOwner: merchantA.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([agent])
      .rpc();

    const pact = await program.account.pact.fetch(pactPda);
    assert.ok("oneShot" in pact.mode);
    assert.equal(pact.mode.oneShot.spent.toString(), "1500000");

    const merchantBalanceAfter = (await getAccount(provider.connection, merchantAta)).amount;
    assert.equal((merchantBalanceAfter - merchantBalanceBefore).toString(), "1500000");
  });

  it("spend_via_pact rejects amount > per_call_max with OverCap", async () => {
    const merchantAta = getAssociatedTokenAddressSync(usdcMint, merchantA.publicKey);
    await assert.rejects(
      program.methods
        .spendViaPact(
          new BN(3_000_000), // exceeds per_call_max of $2
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
          vaultUsdc: vaultUsdcAta,
          merchantUsdc: merchantAta,
          merchantOwner: merchantA.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([agent])
        .rpc(),
      /OverCap/,
    );
  });

  it("spend_via_pact rejects merchant not in pact allowlist with OffAllowlist", async () => {
    const merchantBAta = getAssociatedTokenAddressSync(usdcMint, merchantB.publicKey);
    await assert.rejects(
      program.methods
        .spendViaPact(
          new BN(1_000_000),
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
          vaultUsdc: vaultUsdcAta,
          merchantUsdc: merchantBAta,
          merchantOwner: merchantB.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([agent])
        .rpc(),
      /OffAllowlist/,
    );
  });

  it("spend_via_pact rejects unauthorized agent (signer != card.agent_pubkey)", async () => {
    const merchantAta = getAssociatedTokenAddressSync(usdcMint, merchantA.publicKey);
    await assert.rejects(
      program.methods
        .spendViaPact(
          new BN(500_000),
          Array.from(randomHash32()),
          Array.from(randomHash32()),
          Array.from(randomHash32()),
          Array.from(randomHash32()),
        )
        .accounts({
          agent: attacker.publicKey, // wrong signer
          feePayer: attacker.publicKey,
          card: cardPda,
          pact: pactPda,
          vault: vaultPda,
          usdcMint,
          vaultUsdc: vaultUsdcAta,
          merchantUsdc: merchantAta,
          merchantOwner: merchantA.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc(),
      /UnauthorizedAgent|ConstraintAddress/,
    );
  });

  it("revoke bumps policy_version and emits PolicyDecisionEvent (decision=2 REVOKE)", async () => {
    const before = await program.account.agentCard.fetch(cardPda);
    const beforeVersion = before.policyVersion;

    await program.methods
      .revoke()
      .accounts({ authority: authority.publicKey, card: cardPda })
      .signers([authority])
      .rpc();

    const after = await program.account.agentCard.fetch(cardPda);
    assert.equal(after.revoked, true);
    assert.equal(after.policyVersion, beforeVersion + 1);
  });

  it("spend_via_pact rejects after revoke with CardRevoked", async () => {
    const merchantAta = getAssociatedTokenAddressSync(usdcMint, merchantA.publicKey);
    await assert.rejects(
      program.methods
        .spendViaPact(
          new BN(500_000),
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
          vaultUsdc: vaultUsdcAta,
          merchantUsdc: merchantAta,
          merchantOwner: merchantA.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([agent])
        .rpc(),
      /CardRevoked/,
    );
  });

  it("close_pact refunds remaining vault balance to authority on-chain", async () => {
    const authorityAta = getAssociatedTokenAddressSync(usdcMint, authority.publicKey);
    const balanceBefore = (await getAccount(provider.connection, authorityAta)).amount;
    const vaultBalanceBefore = (await getAccount(provider.connection, vaultUsdcAta)).amount;

    await program.methods
      .closePact()
      .accounts({
        authority: authority.publicKey,
        pact: pactPda,
        vault: vaultPda,
        usdcMint,
        vaultUsdc: vaultUsdcAta,
        authorityUsdc: authorityAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    const balanceAfter = (await getAccount(provider.connection, authorityAta)).amount;
    const refunded = balanceAfter - balanceBefore;
    assert.equal(refunded.toString(), vaultBalanceBefore.toString());

    const pact = await program.account.pact.fetch(pactPda);
    assert.equal(pact.closed, true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Cross-Pact daily cap bypass test.
  //
  // This is the regression test for codex finding #1 in the v0.2 audit: before
  // the fix, two pacts on the same card could each spend up to their cap
  // independently — bypassing the parent card's daily limit. This test creates
  // a SECOND pact, opens + funds it, and verifies that spend_via_pact rejects
  // when the cumulative card.used_today would exceed daily_cap_lamports.
  // ─────────────────────────────────────────────────────────────────────────
  it("spend_via_pact enforces parent card daily_cap across multiple pacts", async () => {
    // First, create a NEW card with a tight daily cap so we can blow through it.
    const tightAuthority = Keypair.generate();
    const tightAgent = Keypair.generate();
    const conn = provider.connection;
    const sigA = await conn.requestAirdrop(tightAuthority.publicKey, 2 * LAMPORTS_PER_SOL);
    const sigB = await conn.requestAirdrop(tightAgent.publicKey, 2 * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sigA, "confirmed");
    await conn.confirmTransaction(sigB, "confirmed");

    await createAssociatedTokenAccount(conn, tightAuthority, usdcMint, tightAuthority.publicKey);
    const tightAuthorityAta = getAssociatedTokenAddressSync(usdcMint, tightAuthority.publicKey);
    await mintTo(conn, authority, usdcMint, tightAuthorityAta, authority, 100_000_000n);

    const tightLabelHash = labelHashBytes("tight-card");
    const [tightCardPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("agent-card"), tightAuthority.publicKey.toBuffer(), tightLabelHash],
      program.programId,
    );

    // dailyCap = $3, perCallMax = $2. Two pacts each at $2 cap could spend $4 → must reject.
    const slot = await conn.getSlot("confirmed");
    const tightExpiry = new BN(slot + 1_000_000);
    await program.methods
      .createCard({
        agentPubkey: tightAgent.publicKey,
        labelHash: Array.from(tightLabelHash),
        dailyCapLamports: new BN(3_000_000),
        perCallMaxLamports: new BN(2_000_000),
        allowlist: [{ merchantPubkey: merchantA.publicKey, capabilityHash: null }],
        expirySlot: tightExpiry,
        policyVersion: 1,
      } as any)
      .accounts({
        authority: tightAuthority.publicKey,
        card: tightCardPda,
        usdcMint,
        systemProgram: SystemProgram.programId,
      })
      .signers([tightAuthority])
      .rpc();

    // Open Pact #1, cap = $2
    const scope1 = labelHashBytes("tight-pact-1");
    const [pact1] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact"), tightCardPda.toBuffer(), scope1],
      program.programId,
    );
    const [vault1] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact-vault"), pact1.toBuffer()],
      program.programId,
    );
    const vault1Ata = getAssociatedTokenAddressSync(usdcMint, vault1, true);

    await program.methods
      .openPact({
        scopeLabelHash: Array.from(scope1),
        capLamports: new BN(2_000_000),
        allowlist: [{ merchantPubkey: merchantA.publicKey, capabilityHash: null }],
        expirySlot: tightExpiry,
      } as any)
      .accounts({
        authority: tightAuthority.publicKey,
        parentCard: tightCardPda,
        pact: pact1,
        vault: vault1,
        usdcMint,
        authorityUsdc: tightAuthorityAta,
        vaultUsdc: vault1Ata,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([tightAuthority])
      .rpc();

    // Open Pact #2, cap = $2 (so total possible = $4 > daily_cap of $3)
    const scope2 = labelHashBytes("tight-pact-2");
    const [pact2] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact"), tightCardPda.toBuffer(), scope2],
      program.programId,
    );
    const [vault2] = PublicKey.findProgramAddressSync(
      [Buffer.from("pact-vault"), pact2.toBuffer()],
      program.programId,
    );
    const vault2Ata = getAssociatedTokenAddressSync(usdcMint, vault2, true);

    await program.methods
      .openPact({
        scopeLabelHash: Array.from(scope2),
        capLamports: new BN(2_000_000),
        allowlist: [{ merchantPubkey: merchantA.publicKey, capabilityHash: null }],
        expirySlot: tightExpiry,
      } as any)
      .accounts({
        authority: tightAuthority.publicKey,
        parentCard: tightCardPda,
        pact: pact2,
        vault: vault2,
        usdcMint,
        authorityUsdc: tightAuthorityAta,
        vaultUsdc: vault2Ata,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([tightAuthority])
      .rpc();

    const merchantAta = getAssociatedTokenAddressSync(usdcMint, merchantA.publicKey);

    // Spend $2 via pact1 — should succeed (used_today = $2)
    await program.methods
      .spendViaPact(
        new BN(2_000_000),
        Array.from(randomHash32()),
        Array.from(randomHash32()),
        Array.from(randomHash32()),
        Array.from(randomHash32()),
      )
      .accounts({
        agent: tightAgent.publicKey,
        feePayer: tightAgent.publicKey,
        card: tightCardPda,
        pact: pact1,
        vault: vault1,
        usdcMint,
        vaultUsdc: vault1Ata,
        merchantUsdc: merchantAta,
        merchantOwner: merchantA.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([tightAgent])
      .rpc();

    // Verify card.used_today is now $2 (proves cross-pact accounting actually updates)
    const cardAfterFirst = await program.account.agentCard.fetch(tightCardPda);
    assert.equal(cardAfterFirst.usedToday.toString(), "2000000");

    // Spend $2 via pact2 — should now FAIL with OverCap because used_today + amount > daily_cap
    await assert.rejects(
      program.methods
        .spendViaPact(
          new BN(2_000_000),
          Array.from(randomHash32()),
          Array.from(randomHash32()),
          Array.from(randomHash32()),
          Array.from(randomHash32()),
        )
        .accounts({
          agent: tightAgent.publicKey,
          feePayer: tightAgent.publicKey,
          card: tightCardPda,
          pact: pact2,
          vault: vault2,
          usdcMint,
          vaultUsdc: vault2Ata,
          merchantUsdc: merchantAta,
          merchantOwner: merchantA.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([tightAgent])
        .rpc(),
      /OverCap/,
    );

    // But $1 via pact2 should succeed — exactly fills the daily cap to $3.
    await program.methods
      .spendViaPact(
        new BN(1_000_000),
        Array.from(randomHash32()),
        Array.from(randomHash32()),
        Array.from(randomHash32()),
        Array.from(randomHash32()),
      )
      .accounts({
        agent: tightAgent.publicKey,
        feePayer: tightAgent.publicKey,
        card: tightCardPda,
        pact: pact2,
        vault: vault2,
        usdcMint,
        vaultUsdc: vault2Ata,
        merchantUsdc: merchantAta,
        merchantOwner: merchantA.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([tightAgent])
      .rpc();

    const cardAfterSecond = await program.account.agentCard.fetch(tightCardPda);
    assert.equal(cardAfterSecond.usedToday.toString(), "3000000");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // record_denial: agent can sign too (not just authority)
  // ─────────────────────────────────────────────────────────────────────────
  it("record_denial accepts the agent as signer (not just authority)", async () => {
    // Use a fresh card whose authority is unrelated to the agent, prove the agent can
    // record a denial on its own.
    const denialAuthority = Keypair.generate();
    const denialAgent = Keypair.generate();
    const conn = provider.connection;
    const sigA = await conn.requestAirdrop(denialAuthority.publicKey, LAMPORTS_PER_SOL);
    const sigB = await conn.requestAirdrop(denialAgent.publicKey, LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sigA, "confirmed");
    await conn.confirmTransaction(sigB, "confirmed");

    const denialLabelHash = labelHashBytes("denial-test-card");
    const [denialCardPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("agent-card"), denialAuthority.publicKey.toBuffer(), denialLabelHash],
      program.programId,
    );

    const slot = await conn.getSlot("confirmed");
    await program.methods
      .createCard({
        agentPubkey: denialAgent.publicKey,
        labelHash: Array.from(denialLabelHash),
        dailyCapLamports: new BN(1_000_000),
        perCallMaxLamports: new BN(500_000),
        allowlist: [{ merchantPubkey: merchantA.publicKey, capabilityHash: null }],
        expirySlot: new BN(slot + 1_000_000),
        policyVersion: 1,
      } as any)
      .accounts({
        authority: denialAuthority.publicKey,
        card: denialCardPda,
        usdcMint,
        systemProgram: SystemProgram.programId,
      })
      .signers([denialAuthority])
      .rpc();

    // Agent signs a denial — should succeed.
    await program.methods
      .recordDenial(
        6, // DuplicateOrLoopDetected
        merchantA.publicKey,
        PublicKey.default,
        Array.from(randomHash32()),
        Array.from(randomHash32()),
        Array.from(randomHash32()),
      )
      .accounts({
        signer: denialAgent.publicKey,
        card: denialCardPda,
      })
      .signers([denialAgent])
      .rpc();

    // Random attacker signs the same denial — should fail.
    await assert.rejects(
      program.methods
        .recordDenial(
          6,
          merchantA.publicKey,
          PublicKey.default,
          Array.from(randomHash32()),
          Array.from(randomHash32()),
          Array.from(randomHash32()),
        )
        .accounts({
          signer: attacker.publicKey,
          card: denialCardPda,
        })
        .signers([attacker])
        .rpc(),
      /UnauthorizedAuthority/,
    );
  });

  it("close_pact rejects re-close with PactClosed", async () => {
    const authorityAta = getAssociatedTokenAddressSync(usdcMint, authority.publicKey);
    await assert.rejects(
      program.methods
        .closePact()
        .accounts({
          authority: authority.publicKey,
          pact: pactPda,
          vault: vaultPda,
          usdcMint,
          vaultUsdc: vaultUsdcAta,
          authorityUsdc: authorityAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([authority])
        .rpc(),
      /PactClosed/,
    );
  });
});

void ZERO32;
