import { describe, it, expect, beforeAll } from "vitest";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// [C] claim 스모크 테스트 — 인출 제한 불변식 ②
//   claim 금액 ≤ claimable − claimed − disputed
// 핵심은 "타인 몫 claim 시도 → Unauthorized로 실패"다. Allocation PDA가 role
// 기반이라 Anchor 자동 검증으로는 안 걸러지고, has_one = beneficiary가 유일한
// 방어선이므로 반드시 테스트로 남긴다.

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

describe("claim", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, provider);

  const DEPOSIT_AMOUNT = 10_000_000;
  const RULE_VERSION = 1;
  const THEATER_BPS = 5000;
  const DISTRIBUTOR_BPS = 5000;
  const DISTRIBUTION_FEE_BPS = 1000;
  const INVESTOR_PROFIT_BPS = 0;

  // settle_batch.test.ts와 동일한 인코딩이어야 한다.
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

  async function theaterAta() {
    const ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      theaterWallet.publicKey,
    );
    return ata.address;
  }

  // init -> deposit -> verify -> settle 까지 끝내고 claim 가능한 상태로 만든다.
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
      DEPOSIT_AMOUNT * 20,
    );
  });

  it("pays out a beneficiary's own share and moves allocated -> paid_out", async () => {
    const movieId = `claim-ok-${Date.now()}`;
    const escrowPda = await setupSettledEscrow(movieId);
    const before = await program.account.movieEscrow.fetch(escrowPda);
    const ata = await theaterAta();
    const ataBefore = await getAccount(provider.connection, ata);
    const theaterBefore = await program.account.allocation.fetch(
      allocationPda(movieId, 0),
    );

    await program.methods
      .claim(theaterBefore.claimable)
      .accounts({
        beneficiary: theaterWallet.publicKey,
        escrow: escrowPda,
        allocation: allocationPda(movieId, 0),
        beneficiaryTokenAccount: ata,
        vault: before.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([theaterWallet])
      .rpc();

    const theater = await program.account.allocation.fetch(
      allocationPda(movieId, 0),
    );
    expect(theater.claimed.toNumber()).toBe(theaterBefore.claimable.toNumber());
    expect(theater.claimable.toNumber()).toBe(theaterBefore.claimable.toNumber());
    expect(theater.disputed.toNumber()).toBe(0);

    const after = await program.account.movieEscrow.fetch(escrowPda);
    expect(after.allocated.toNumber()).toBe(
      before.allocated.toNumber() - theaterBefore.claimable.toNumber(),
    );
    expect(after.paidOut.toNumber()).toBe(
      before.paidOut.toNumber() + theaterBefore.claimable.toNumber(),
    );

    // 실제 USDC가 극장 지갑으로 들어왔는지
    const ataAfter = await getAccount(provider.connection, ata);
    expect(Number(ataAfter.amount) - Number(ataBefore.amount)).toBe(
      theaterBefore.claimable.toNumber(),
    );

    // 불변식 ①
    expect(
      after.pending.toNumber() +
        after.allocated.toNumber() +
        after.disputed.toNumber() +
        after.paidOut.toNumber() +
        after.refunded.toNumber(),
    ).toBe(after.grossIn.toNumber());
  });

  it("rejects a claim that points at another beneficiary's allocation", async () => {
    const movieId = `claim-stranger-${Date.now()}`;
    const escrowPda = await setupSettledEscrow(movieId);
    const before = await program.account.movieEscrow.fetch(escrowPda);
    const ata = await theaterAta();
    const distributorBefore = await program.account.allocation.fetch(
      allocationPda(movieId, 1),
    );

    await expect(
      program.methods
        .claim(distributorBefore.claimable)
        .accounts({
          beneficiary: theaterWallet.publicKey,
          escrow: escrowPda,
          allocation: allocationPda(movieId, 1),
          beneficiaryTokenAccount: ata,
          vault: before.vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([theaterWallet])
        .rpc(),
    ).rejects.toThrow(/Unauthorized/);

    // 실패했으면 배급사 장부가 그대로여야 한다
    const distributor = await program.account.allocation.fetch(
      allocationPda(movieId, 1),
    );
    expect(distributor.claimed.toNumber()).toBe(0);
  });

  it("rejects a claim larger than the remaining claimable", async () => {
    const movieId = `claim-over-${Date.now()}`;
    const escrowPda = await setupSettledEscrow(movieId);
    const before = await program.account.movieEscrow.fetch(escrowPda);
    const ata = await theaterAta();
    const theaterBefore = await program.account.allocation.fetch(
      allocationPda(movieId, 0),
    );

    await expect(
      program.methods
        .claim(theaterBefore.claimable.addn(1))
        .accounts({
          beneficiary: theaterWallet.publicKey,
          escrow: escrowPda,
          allocation: allocationPda(movieId, 0),
          beneficiaryTokenAccount: ata,
          vault: before.vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([theaterWallet])
        .rpc(),
    ).rejects.toThrow(/ExceedsClaimable/);
  });
});