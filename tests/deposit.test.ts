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

// [B] deposit 스모크 테스트 — 관객 결제가 escrow vault로 실제로 들어가고,
// gross_in/pending이 정확히 갱신되는지만 확인한다 (환불·정산 로직은 별도 instruction).

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const idl = JSON.parse(
  readFileSync(resolve(repoRoot, "target/idl/movie_escrow.json"), "utf8"),
);

describe("deposit", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, provider);

  let usdcMint: PublicKey;
  let payerTokenAccount: PublicKey;
  const movieId = `test-movie-deposit-${Date.now()}`;
  const authority = Keypair.generate();

  let escrowPda: PublicKey;
  let vaultPda: PublicKey;

  const DEPOSIT_AMOUNT = 10_000_000; // 10 USDC (6 decimals)

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
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        associatedTokenProgram: new PublicKey(
          "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
        ),
        systemProgram: PublicKey.default,
      })
      .rpc();

    const escrowAfterInit = await program.account.movieEscrow.fetch(escrowPda);
    vaultPda = escrowAfterInit.vault;
  });

  it("transfers USDC into the vault and updates gross_in/pending", async () => {
    await program.methods
      .deposit(new anchor.BN(DEPOSIT_AMOUNT))
      .accounts({
        payer: provider.wallet.publicKey,
        escrow: escrowPda,
        payerTokenAccount,
        vault: vaultPda,
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      })
      .rpc();

    const escrow = await program.account.movieEscrow.fetch(escrowPda);
    expect(escrow.grossIn.toNumber()).toBe(DEPOSIT_AMOUNT);
    expect(escrow.pending.toNumber()).toBe(DEPOSIT_AMOUNT);
    expect(escrow.allocated.toNumber()).toBe(0);

    const vaultAccount = await getAccount(provider.connection, vaultPda);
    expect(Number(vaultAccount.amount)).toBe(DEPOSIT_AMOUNT);
  });

  it("accumulates across multiple deposits", async () => {
    await program.methods
      .deposit(new anchor.BN(DEPOSIT_AMOUNT))
      .accounts({
        payer: provider.wallet.publicKey,
        escrow: escrowPda,
        payerTokenAccount,
        vault: vaultPda,
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      })
      .rpc();

    const escrow = await program.account.movieEscrow.fetch(escrowPda);
    expect(escrow.grossIn.toNumber()).toBe(DEPOSIT_AMOUNT * 2);
    expect(escrow.pending.toNumber()).toBe(DEPOSIT_AMOUNT * 2);
  });

  it("rejects a zero-amount deposit", async () => {
    await expect(
      program.methods
        .deposit(new anchor.BN(0))
        .accounts({
          payer: provider.wallet.publicKey,
          escrow: escrowPda,
          payerTokenAccount,
          vault: vaultPda,
          tokenProgram: new PublicKey(
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          ),
        })
        .rpc(),
    ).rejects.toThrow();
  });
});
