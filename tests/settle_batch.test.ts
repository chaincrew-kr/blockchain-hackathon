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
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// [B] settle_batch 스모크 테스트 — 축소 워터폴(부과금→VAT→부율 분할→배급수수료)이
// 정수 연산으로 기대값과 정확히 일치하고, pending 전액이 allocated/paid_out으로
// 재구성되는지(불변식 ①) 확인한다. MG 상환·투자 상환·이익 배분은 미구현이라
// 다루지 않는다.

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

describe("settle_batch", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, provider);

  const DEPOSIT_AMOUNT = 10_000_000; // 10 USDC (6 decimals)
  const THEATER_BPS = 5000;
  const DISTRIBUTOR_BPS = 5000;
  const DISTRIBUTION_FEE_BPS = 1000;

  // 손 계산 기대값 (gross=10_000_000 기준):
  //   levy = round(10_000_000 × 3 / 103)            = 291_262
  //   vat  = (10_000_000 - levy) / 11 (내림)          = 882_612
  //   net_revenue = 10_000_000 - levy - vat           = 8_826_126
  //   theater(50%) = net_revenue / 2                  = 4_413_063
  //   distributor_amount = net_revenue - theater       = 4_413_063
  //   distribution_fee(10%) = distributor_amount × 0.1 = 441_306
  //   producer = distributor_amount - distribution_fee  = 3_971_757
  const EXPECTED_LEVY = 291_262;
  const EXPECTED_VAT = 882_612;
  const EXPECTED_THEATER = 4_413_063;
  const EXPECTED_DISTRIBUTION_FEE = 441_306;
  const EXPECTED_PRODUCER = 3_971_757;

  let usdcMint: PublicKey;
  let payerTokenAccount: PublicKey;
  const authority = Keypair.generate();
  const theaterWallet = Keypair.generate();
  const distributorWallet = Keypair.generate();
  const producerWallet = Keypair.generate();

  function allocationPda(movieId: string, role: number) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("allocation"), Buffer.from(movieId), Buffer.from([role])],
      program.programId,
    )[0];
  }

  function settleBatchAccounts(movieId: string, escrowPda: PublicKey) {
    return {
      escrow: escrowPda,
      theaterAllocation: allocationPda(movieId, 0),
      theaterWallet: theaterWallet.publicKey,
      distributorAllocation: allocationPda(movieId, 1),
      distributorWallet: distributorWallet.publicKey,
      producerAllocation: allocationPda(movieId, 2),
      producerWallet: producerWallet.publicKey,
      systemProgram: PublicKey.default,
    };
  }

  async function initAndDeposit(movieId: string) {
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(movieId)],
      program.programId,
    );

    await program.methods
      .initEscrow(
        movieId,
        Array.from(new Uint8Array(32).fill(1)),
        Array.from(new Uint8Array(32).fill(2)),
        1,
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
      .deposit(new anchor.BN(DEPOSIT_AMOUNT))
      .accounts({
        payer: provider.wallet.publicKey,
        escrow: escrowPda,
        payerTokenAccount,
        vault: escrowAfterInit.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return escrowPda;
  }

  async function setupVerifiedEscrow(movieId: string) {
    const escrowPda = await initAndDeposit(movieId);

    await program.methods
      .verifyEscrow()
      .accounts({
        authority: authority.publicKey,
        escrow: escrowPda,
      })
      .signers([authority])
      .rpc();

    return escrowPda;
  }

  beforeAll(async () => {
    // authority가 settle_batch의 rent(Allocation PDA 3개 생성)를 지불하므로 펀딩 필요.
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
      DEPOSIT_AMOUNT * 10,
    );
  });

  it("rejects settle_batch before verify_escrow (still Pending)", async () => {
    const movieId = `settle-pending-${Date.now()}`;
    const escrowPda = await initAndDeposit(movieId);

    await expect(
      program.methods
        .settleBatch(
          "SCR-1",
          new anchor.BN(DEPOSIT_AMOUNT),
          THEATER_BPS,
          DISTRIBUTOR_BPS,
          DISTRIBUTION_FEE_BPS,
        )
        .accounts({
          authority: authority.publicKey,
          ...settleBatchAccounts(movieId, escrowPda),
        })
        .signers([authority])
        .rpc(),
    ).rejects.toThrow();
  });

  it("rejects bps that don't sum to 100%", async () => {
    const movieId = `settle-badbps-${Date.now()}`;
    const escrowPda = await setupVerifiedEscrow(movieId);

    await expect(
      program.methods
        .settleBatch(
          "SCR-1",
          new anchor.BN(DEPOSIT_AMOUNT),
          4000,
          5000,
          DISTRIBUTION_FEE_BPS,
        )
        .accounts({
          authority: authority.publicKey,
          ...settleBatchAccounts(movieId, escrowPda),
        })
        .signers([authority])
        .rpc(),
    ).rejects.toThrow();
  });

  it("rejects an amount larger than escrow.pending", async () => {
    const movieId = `settle-overamount-${Date.now()}`;
    const escrowPda = await setupVerifiedEscrow(movieId);

    await expect(
      program.methods
        .settleBatch(
          "SCR-1",
          new anchor.BN(DEPOSIT_AMOUNT + 1),
          THEATER_BPS,
          DISTRIBUTOR_BPS,
          DISTRIBUTION_FEE_BPS,
        )
        .accounts({
          authority: authority.publicKey,
          ...settleBatchAccounts(movieId, escrowPda),
        })
        .signers([authority])
        .rpc(),
    ).rejects.toThrow();
  });

  it("rejects settle_batch from a wallet that isn't escrow.authority", async () => {
    const movieId = `settle-stranger-${Date.now()}`;
    const escrowPda = await setupVerifiedEscrow(movieId);
    const stranger = Keypair.generate();

    await expect(
      program.methods
        .settleBatch(
          "SCR-1",
          new anchor.BN(DEPOSIT_AMOUNT),
          THEATER_BPS,
          DISTRIBUTOR_BPS,
          DISTRIBUTION_FEE_BPS,
        )
        .accounts({
          authority: stranger.publicKey,
          ...settleBatchAccounts(movieId, escrowPda),
        })
        .signers([stranger])
        .rpc(),
    ).rejects.toThrow();
  });

  it("computes the reduced waterfall and moves pending -> allocated/paid_out", async () => {
    const movieId = `settle-ok-${Date.now()}`;
    const escrowPda = await setupVerifiedEscrow(movieId);

    await program.methods
      .settleBatch(
        "SCR-1",
        new anchor.BN(DEPOSIT_AMOUNT),
        THEATER_BPS,
        DISTRIBUTOR_BPS,
        DISTRIBUTION_FEE_BPS,
      )
      .accounts({
        authority: authority.publicKey,
        ...settleBatchAccounts(movieId, escrowPda),
      })
      .signers([authority])
      .rpc();

    const escrow = await program.account.movieEscrow.fetch(escrowPda);
    expect(escrow.state).toEqual({ allocated: {} });
    expect(escrow.pending.toNumber()).toBe(0);
    expect(escrow.paidOut.toNumber()).toBe(EXPECTED_LEVY + EXPECTED_VAT);
    expect(escrow.allocated.toNumber()).toBe(
      EXPECTED_THEATER + EXPECTED_DISTRIBUTION_FEE + EXPECTED_PRODUCER,
    );
    expect(escrow.batchCount).toBe(1);

    // 불변식 ①: gross_in = pending + allocated + disputed + paid_out + refunded
    expect(
      escrow.pending.toNumber() +
        escrow.allocated.toNumber() +
        escrow.disputed.toNumber() +
        escrow.paidOut.toNumber() +
        escrow.refunded.toNumber(),
    ).toBe(escrow.grossIn.toNumber());

    const theater = await program.account.allocation.fetch(
      allocationPda(movieId, 0),
    );
    expect(theater.claimable.toNumber()).toBe(EXPECTED_THEATER);
    expect(theater.claimed.toNumber()).toBe(0);
    expect(theater.beneficiary.toString()).toBe(
      theaterWallet.publicKey.toString(),
    );
    expect(theater.role).toEqual({ theater: {} });

    const distributor = await program.account.allocation.fetch(
      allocationPda(movieId, 1),
    );
    expect(distributor.claimable.toNumber()).toBe(EXPECTED_DISTRIBUTION_FEE);
    expect(distributor.role).toEqual({ distributor: {} });

    const producer = await program.account.allocation.fetch(
      allocationPda(movieId, 2),
    );
    expect(producer.claimable.toNumber()).toBe(EXPECTED_PRODUCER);
    expect(producer.role).toEqual({ producer: {} });
  });

  it("accumulates claimable across multiple screenings for the same movie (issue #6)", async () => {
    const movieId = `settle-multiscreen-${Date.now()}`;
    const escrowPda = await setupVerifiedEscrow(movieId);

    // 두 번째 회차분 입금 — 이미 한 번 deposit된 상태(setupVerifiedEscrow)에
    // 더해서, escrow.pending에 두 회차 몫이 함께 쌓이게 한다.
    const escrowBeforeSecondDeposit =
      await program.account.movieEscrow.fetch(escrowPda);
    await program.methods
      .deposit(new anchor.BN(DEPOSIT_AMOUNT))
      .accounts({
        payer: provider.wallet.publicKey,
        escrow: escrowPda,
        payerTokenAccount,
        vault: escrowBeforeSecondDeposit.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // 회차 1 정산
    await program.methods
      .settleBatch(
        "SCR-A",
        new anchor.BN(DEPOSIT_AMOUNT),
        THEATER_BPS,
        DISTRIBUTOR_BPS,
        DISTRIBUTION_FEE_BPS,
      )
      .accounts({
        authority: authority.publicKey,
        ...settleBatchAccounts(movieId, escrowPda),
      })
      .signers([authority])
      .rpc();

    // 회차 2 정산 — 같은 Allocation PDA에 누적돼야 한다 (init_if_needed).
    await program.methods
      .settleBatch(
        "SCR-B",
        new anchor.BN(DEPOSIT_AMOUNT),
        THEATER_BPS,
        DISTRIBUTOR_BPS,
        DISTRIBUTION_FEE_BPS,
      )
      .accounts({
        authority: authority.publicKey,
        ...settleBatchAccounts(movieId, escrowPda),
      })
      .signers([authority])
      .rpc();

    const escrow = await program.account.movieEscrow.fetch(escrowPda);
    expect(escrow.pending.toNumber()).toBe(0);
    expect(escrow.batchCount).toBe(2);
    expect(escrow.paidOut.toNumber()).toBe(2 * (EXPECTED_LEVY + EXPECTED_VAT));
    expect(escrow.allocated.toNumber()).toBe(
      2 * (EXPECTED_THEATER + EXPECTED_DISTRIBUTION_FEE + EXPECTED_PRODUCER),
    );

    const theater = await program.account.allocation.fetch(
      allocationPda(movieId, 0),
    );
    expect(theater.claimable.toNumber()).toBe(2 * EXPECTED_THEATER);
    expect(theater.beneficiary.toString()).toBe(
      theaterWallet.publicKey.toString(),
    );

    const producer = await program.account.allocation.fetch(
      allocationPda(movieId, 2),
    );
    expect(producer.claimable.toNumber()).toBe(2 * EXPECTED_PRODUCER);
  });

  it("rejects a screening's settle_batch that points beneficiary wallets at a different address than an earlier screening", async () => {
    const movieId = `settle-walletswap-${Date.now()}`;
    const escrowPda = await setupVerifiedEscrow(movieId);

    await program.methods
      .settleBatch(
        "SCR-A",
        new anchor.BN(DEPOSIT_AMOUNT),
        THEATER_BPS,
        DISTRIBUTOR_BPS,
        DISTRIBUTION_FEE_BPS,
      )
      .accounts({
        authority: authority.publicKey,
        ...settleBatchAccounts(movieId, escrowPda),
      })
      .signers([authority])
      .rpc();

    const escrowAfterFirst = await program.account.movieEscrow.fetch(escrowPda);
    await program.methods
      .deposit(new anchor.BN(DEPOSIT_AMOUNT))
      .accounts({
        payer: provider.wallet.publicKey,
        escrow: escrowPda,
        payerTokenAccount,
        vault: escrowAfterFirst.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const impostorTheaterWallet = Keypair.generate();
    await expect(
      program.methods
        .settleBatch(
          "SCR-B",
          new anchor.BN(DEPOSIT_AMOUNT),
          THEATER_BPS,
          DISTRIBUTOR_BPS,
          DISTRIBUTION_FEE_BPS,
        )
        .accounts({
          authority: authority.publicKey,
          ...settleBatchAccounts(movieId, escrowPda),
          theaterWallet: impostorTheaterWallet.publicKey,
        })
        .signers([authority])
        .rpc(),
    ).rejects.toThrow();
  });
});
