import { describe, it, expect, beforeAll } from "vitest";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { createMint } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// [B] verify_escrow 스모크 테스트 — STAGE 3→2 게이트가 Pending에서만
// 열리고, escrow.authority 본인만 호출할 수 있는지 확인한다.

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

describe("verify_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, provider);

  let usdcMint: PublicKey;
  const movieId = `test-movie-verify-${Date.now()}`;
  const authority = Keypair.generate();

  let escrowPda: PublicKey;

  beforeAll(async () => {
    usdcMint = await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      provider.wallet.publicKey,
      null,
      6,
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
  });

  it("rejects verification from a wallet that isn't escrow.authority", async () => {
    const stranger = Keypair.generate();

    await expect(
      program.methods
        .verifyEscrow()
        .accounts({
          authority: stranger.publicKey,
          escrow: escrowPda,
        })
        .signers([stranger])
        .rpc(),
    ).rejects.toThrow();
  });

  it("transitions Pending -> Verified when called by escrow.authority", async () => {
    await program.methods
      .verifyEscrow()
      .accounts({
        authority: authority.publicKey,
        escrow: escrowPda,
      })
      .signers([authority])
      .rpc();

    const escrow = await program.account.movieEscrow.fetch(escrowPda);
    expect(escrow.state).toEqual({ verified: {} });
  });

  it("rejects a second verify_escrow call once already Verified", async () => {
    await expect(
      program.methods
        .verifyEscrow()
        .accounts({
          authority: authority.publicKey,
          escrow: escrowPda,
        })
        .signers([authority])
        .rpc(),
    ).rejects.toThrow();
  });
});
