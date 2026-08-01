import { describe, it, expect, beforeAll } from "vitest";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// [C] mark_disputed / resolve_dispute 스모크 테스트.
// 핵심은 "부분 격리"다 — 특정 권리자의 일부 금액만 묶이고, 나머지 권리자는
// 영향 없이 계속 인출할 수 있어야 한다. escrow.state가 Disputed로 바뀌어도
// claim이 막히면 안 된다.

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const idl = JSON.parse(
  readFileSync(resolve(repoRoot, "target/idl/movie_escrow.json"), "utf8"),
);
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

describe("dispute", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, provider);

  const DEPOSIT_AMOUNT = 10_000_000;
  const RULE_VERSION = 1;
  const THEATER_BPS = 5000;
  const DISTRIBUTOR_BPS = 5000;
  const DISTRIBUTION_FEE_BPS = 1000;
  const INVESTOR_PROFIT_BPS = 0;

  const RULE_HASH = createHash("sha256")
    .update(
      [
        RULE_VERSION,
        THEATER_BPS,
        DISTRIBUTOR_BPS,
        DISTRIBUTION_FEE_BPS,
        INVESTOR_PROFIT_BPS,
      ].join("|"),
    )
    .digest();

  const DISPUTE_AMOUNT = 1_000_000;

  let usdcMint: PublicKey;
  let payerTokenAccount: PublicKey;
  const authority = Keypair.generate();
  const theaterWallet = Keypair.generate();
  const distributorWallet = Keypair.generate();
  const producerWallet = Keypair.generate();
  const investorWallet = Keypair.generate();

  function allocationPda(movieId: string, role: number) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("allocation"), Buffer.from(movieId), Buffer.from([role])],
      program.programId,
    )[0];
  }

  async function ataFor(owner: PublicKey) {
    const ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      owner,
    );
    return ata.address;
  }

  async function setupSettledEscrow(movieId: string) {
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(movieId)],
      program.programId,
    );

    await program.methods
      .initEscrow(
        movieId,
        Keypair.generate().publicKey,
        Array.from(new Uint8Array(32).fill(1)),
        Array.from(RULE_HASH),
        RULE_VERSION,
        new anchor.BN(0),
        new anchor.BN(0),
      )
      .accounts({
        payer: provider.wallet.publicKey,
        escrow: escrowPda,
        usdcMint,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: PublicKey.default,
      })
      .signers([authority])
      .rpc();

    const escrowAfterInit = await program.account.movieEscrow.fetch(escrowPda);

    await program.methods
      .deposit("SCR-1", "A16", new anchor.BN(DEPOSIT_AMOUNT))
      .accounts({
        payer: provider.wallet.publicKey,
        escrow: escrowPda,
        payerTokenAccount,
        vault: escrowAfterInit.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    await program.methods
      .verifyEscrow()
      .accounts({ authority: authority.publicKey, escrow: escrowPda })
      .signers([authority])
      .rpc();

    await program.methods
      .settleBatch(
        "SCR-1",
        new anchor.BN(DEPOSIT_AMOUNT),
        THEATER_BPS,
        DISTRIBUTOR_BPS,
        DISTRIBUTION_FEE_BPS,
        INVESTOR_PROFIT_BPS,
      )
      .accounts({
        authority: authority.publicKey,
        escrow: escrowPda,
        theaterAllocation: allocationPda(movieId, 0),
        theaterWallet: theaterWallet.publicKey,
        distributorAllocation: allocationPda(movieId, 1),
        distributorWallet: distributorWallet.publicKey,
        producerAllocation: allocationPda(movieId, 2),
        producerWallet: producerWallet.publicKey,
        investorAllocation: allocationPda(movieId, 3),
        investorWallet: investorWallet.publicKey,
        systemProgram: PublicKey.default,
      })
      .signers([authority])
      .rpc();

    return escrowPda;
  }

  // 제작사 몫 일부를 보류시킨 상태로 만든다.
  async function setupWithDispute(movieId: string) {
    const escrowPda = await setupSettledEscrow(movieId);

    await program.methods
      .markDisputed(new anchor.BN(DISPUTE_AMOUNT))
      .accounts({
        authority: authority.publicKey,
        escrow: escrowPda,
        allocation: allocationPda(movieId, 2),
      })
      .signers([authority])
      .rpc();

    return escrowPda;
  }

  beforeAll(async () => {
    const airdropSig = await provider.connection.requestAirdrop(
      authority.publicKey,
      1_000_000_000,
    );
    await provider.connection.confirmTransaction(airdropSig);

    usdcMint = await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      provider.wallet.publicKey,
      null,
      6,
    );

    const payerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      provider.wallet.publicKey,
    );
    payerTokenAccount = payerAta.address;

    await mintTo(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      payerTokenAccount,
      provider.wallet.publicKey,
      DEPOSIT_AMOUNT * 30,
    );
  });

  it("moves allocated -> disputed for one beneficiary only", async () => {
    const movieId = `dispute-mark-${Date.now()}`;
    const escrowPda = await setupSettledEscrow(movieId);
    const before = await program.account.movieEscrow.fetch(escrowPda);
    const producerBefore = await program.account.allocation.fetch(
      allocationPda(movieId, 2),
    );
    const theaterBefore = await program.account.allocation.fetch(
      allocationPda(movieId, 0),
    );

    await program.methods
      .markDisputed(new anchor.BN(DISPUTE_AMOUNT))
      .accounts({
        authority: authority.publicKey,
        escrow: escrowPda,
        allocation: allocationPda(movieId, 2),
      })
      .signers([authority])
      .rpc();

    const producer = await program.account.allocation.fetch(
      allocationPda(movieId, 2),
    );
    expect(producer.disputed.toNumber()).toBe(DISPUTE_AMOUNT);
    // claimable은 건드리지 않는다 — settle_batch가 확정한 원래 몫 보존
    expect(producer.claimable.toNumber()).toBe(producerBefore.claimable.toNumber());

    // 다른 권리자는 영향 없음
    const theater = await program.account.allocation.fetch(
      allocationPda(movieId, 0),
    );
    expect(theater.disputed.toNumber()).toBe(0);
    expect(theater.claimable.toNumber()).toBe(theaterBefore.claimable.toNumber());

    const after = await program.account.movieEscrow.fetch(escrowPda);
    expect(after.disputed.toNumber()).toBe(DISPUTE_AMOUNT);
    expect(after.allocated.toNumber()).toBe(
      before.allocated.toNumber() - DISPUTE_AMOUNT,
    );
    expect(after.state).toEqual({ disputed: {} });

    // 불변식 ①
    expect(
      after.pending.toNumber() +
        after.allocated.toNumber() +
        after.disputed.toNumber() +
        after.paidOut.toNumber() +
        after.refunded.toNumber(),
    ).toBe(after.grossIn.toNumber());
  });

  it("lets an unaffected beneficiary keep claiming while a dispute is open", async () => {
    const movieId = `dispute-others-${Date.now()}`;
    const escrowPda = await setupWithDispute(movieId);
    const escrow = await program.account.movieEscrow.fetch(escrowPda);
    expect(escrow.state).toEqual({ disputed: {} });
    const theaterBefore = await program.account.allocation.fetch(
      allocationPda(movieId, 0),
    );

    // 분쟁과 무관한 극장은 전액 인출 가능해야 한다
    await program.methods
      .claim(theaterBefore.claimable)
      .accounts({
        beneficiary: theaterWallet.publicKey,
        escrow: escrowPda,
        allocation: allocationPda(movieId, 0),
        beneficiaryTokenAccount: await ataFor(theaterWallet.publicKey),
        vault: escrow.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([theaterWallet])
      .rpc();

    const theater = await program.account.allocation.fetch(
      allocationPda(movieId, 0),
    );
    expect(theater.claimed.toNumber()).toBe(theaterBefore.claimable.toNumber());
  });

  it("blocks the disputed portion but allows the rest", async () => {
    const movieId = `dispute-partial-${Date.now()}`;
    const escrowPda = await setupWithDispute(movieId);
    const escrow = await program.account.movieEscrow.fetch(escrowPda);
    const producerAta = await ataFor(producerWallet.publicKey);
    const producerBefore = await program.account.allocation.fetch(
      allocationPda(movieId, 2),
    );
    const remaining = producerBefore.claimable.sub(
      new anchor.BN(DISPUTE_AMOUNT),
    );

    // 전액 요청은 보류분 때문에 거부
    await expect(
      program.methods
        .claim(producerBefore.claimable)
        .accounts({
          beneficiary: producerWallet.publicKey,
          escrow: escrowPda,
          allocation: allocationPda(movieId, 2),
          beneficiaryTokenAccount: producerAta,
          vault: escrow.vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([producerWallet])
        .rpc(),
    ).rejects.toThrow(/ExceedsClaimable/);

    // 보류분을 뺀 나머지는 인출 가능
    await program.methods
      .claim(remaining)
      .accounts({
        beneficiary: producerWallet.publicKey,
        escrow: escrowPda,
        allocation: allocationPda(movieId, 2),
        beneficiaryTokenAccount: producerAta,
        vault: escrow.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([producerWallet])
      .rpc();

    const producer = await program.account.allocation.fetch(
      allocationPda(movieId, 2),
    );
    expect(producer.claimed.toNumber()).toBe(remaining.toNumber());
  });

  it("rejects mark_disputed from a wallet that isn't escrow.authority", async () => {
    const movieId = `dispute-stranger-${Date.now()}`;
    const escrowPda = await setupSettledEscrow(movieId);
    const stranger = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      stranger.publicKey,
      100_000_000,
    );
    await provider.connection.confirmTransaction(sig);

    await expect(
      program.methods
        .markDisputed(new anchor.BN(DISPUTE_AMOUNT))
        .accounts({
          authority: stranger.publicKey,
          escrow: escrowPda,
          allocation: allocationPda(movieId, 2),
        })
        .signers([stranger])
        .rpc(),
    ).rejects.toThrow();
  });

  it("restores the disputed amount and returns to Allocated on approval", async () => {
    const movieId = `dispute-approve-${Date.now()}`;
    const escrowPda = await setupWithDispute(movieId);
    const before = await program.account.movieEscrow.fetch(escrowPda);
    const producerBefore = await program.account.allocation.fetch(
      allocationPda(movieId, 2),
    );

    await program.methods
      .resolveDispute(true)
      .accounts({
        authority: authority.publicKey,
        escrow: escrowPda,
        allocation: allocationPda(movieId, 2),
      })
      .signers([authority])
      .rpc();

    const producer = await program.account.allocation.fetch(
      allocationPda(movieId, 2),
    );
    expect(producer.disputed.toNumber()).toBe(0);
    expect(producer.claimable.toNumber()).toBe(producerBefore.claimable.toNumber());

    const after = await program.account.movieEscrow.fetch(escrowPda);
    expect(after.disputed.toNumber()).toBe(0);
    expect(after.allocated.toNumber()).toBe(
      before.allocated.toNumber() + DISPUTE_AMOUNT,
    );
    expect(after.state).toEqual({ allocated: {} });

    // 복구됐으니 전액 인출 가능
    await program.methods
      .claim(producerBefore.claimable)
      .accounts({
        beneficiary: producerWallet.publicKey,
        escrow: escrowPda,
        allocation: allocationPda(movieId, 2),
        beneficiaryTokenAccount: await ataFor(producerWallet.publicKey),
        vault: after.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([producerWallet])
      .rpc();
  });

  it("removes the disputed amount from claimable on rejection", async () => {
    const movieId = `dispute-reject-${Date.now()}`;
    const escrowPda = await setupWithDispute(movieId);
    const before = await program.account.movieEscrow.fetch(escrowPda);
    const producerBefore = await program.account.allocation.fetch(
      allocationPda(movieId, 2),
    );

    await program.methods
      .resolveDispute(false)
      .accounts({
        authority: authority.publicKey,
        escrow: escrowPda,
        allocation: allocationPda(movieId, 2),
      })
      .signers([authority])
      .rpc();

    const producer = await program.account.allocation.fetch(
      allocationPda(movieId, 2),
    );
    expect(producer.disputed.toNumber()).toBe(0);
    // 기각이므로 몫에서 영구 삭감
    expect(producer.claimable.toNumber()).toBe(
      producerBefore.claimable.toNumber() - DISPUTE_AMOUNT,
    );

    const after = await program.account.movieEscrow.fetch(escrowPda);
    expect(after.disputed.toNumber()).toBe(0);
    expect(after.refunded.toNumber()).toBe(
      before.refunded.toNumber() + DISPUTE_AMOUNT,
    );
    expect(after.state).toEqual({ allocated: {} });

    // 불변식 ①
    expect(
      after.pending.toNumber() +
        after.allocated.toNumber() +
        after.disputed.toNumber() +
        after.paidOut.toNumber() +
        after.refunded.toNumber(),
    ).toBe(after.grossIn.toNumber());
  });
});