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
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// [B] refund_pending 스모크 테스트 — 격리 불변식 ③(Pending 자금의 유일한
// 출구는 관객 환불)을 검증한다: 정상 환불, pending 초과 환불 거부, 본인
// 소유 아닌 ATA로의 환불 거부.

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

describe("refund_pending", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, provider);

  let usdcMint: PublicKey;
  let payerTokenAccount: PublicKey;
  const movieId = `test-movie-refund-${Date.now()}`;
  const authority = Keypair.generate();

  let escrowPda: PublicKey;
  let vaultPda: PublicKey;

  const DEPOSIT_AMOUNT = 10_000_000;

  beforeAll(async () => {
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
      DEPOSIT_AMOUNT * 5,
    );

    [escrowPda] = PublicKey.findProgramAddressSync(
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
    vaultPda = escrowAfterInit.vault;

    await program.methods
      .deposit(new anchor.BN(DEPOSIT_AMOUNT))
      .accounts({
        payer: provider.wallet.publicKey,
        escrow: escrowPda,
        payerTokenAccount,
        vault: vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  });

  it("returns funds to the payer and updates pending/refunded", async () => {
    const refundAmount = 4_000_000;

    await program.methods
      .refundPending(new anchor.BN(refundAmount))
      .accounts({
        payer: provider.wallet.publicKey,
        escrow: escrowPda,
        payerTokenAccount,
        vault: vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const escrow = await program.account.movieEscrow.fetch(escrowPda);
    expect(escrow.pending.toNumber()).toBe(DEPOSIT_AMOUNT - refundAmount);
    expect(escrow.refunded.toNumber()).toBe(refundAmount);
    // 격리 불변식: gross_in은 refund로 줄지 않는다 (유입 누계는 불변).
    expect(escrow.grossIn.toNumber()).toBe(DEPOSIT_AMOUNT);

    const vaultAccount = await getAccount(provider.connection, vaultPda);
    expect(Number(vaultAccount.amount)).toBe(DEPOSIT_AMOUNT - refundAmount);
  });

  it("rejects a refund exceeding the remaining pending balance", async () => {
    const escrowBefore = await program.account.movieEscrow.fetch(escrowPda);
    const tooMuch = escrowBefore.pending.toNumber() + 1;

    await expect(
      program.methods
        .refundPending(new anchor.BN(tooMuch))
        .accounts({
          payer: provider.wallet.publicKey,
          escrow: escrowPda,
          payerTokenAccount,
          vault: vaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
    ).rejects.toThrow();
  });

  it("rejects a refund into a token account the signer doesn't own", async () => {
    const stranger = Keypair.generate();
    const strangerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      stranger.publicKey,
    );

    await expect(
      program.methods
        .refundPending(new anchor.BN(1_000_000))
        .accounts({
          payer: provider.wallet.publicKey,
          escrow: escrowPda,
          payerTokenAccount: strangerAta.address,
          vault: vaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
    ).rejects.toThrow();
  });
});
