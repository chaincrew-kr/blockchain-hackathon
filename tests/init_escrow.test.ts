import { describe, it, expect, beforeAll } from "vitest";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { createMint, getAccount } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// [B] init_escrow 스모크 테스트 — localnet에 에스크로 PDA + vault ATA가
// 실제로 생성되고, 초기 필드가 기대한 값으로 채워지는지만 확인한다.
// (계약서 해시 검증, 정산 로직 등은 이후 instruction에서 다룸)

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const idl = JSON.parse(
  readFileSync(resolve(repoRoot, "target/idl/movie_escrow.json"), "utf8"),
);

describe("init_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, provider);

  let usdcMint: PublicKey;
  const movieId = `test-movie-${Date.now()}`;
  const contractHash = new Uint8Array(32).fill(1);
  const ruleHash = new Uint8Array(32).fill(2);
  const ruleVersion = 1;
  const authority = Keypair.generate();

  let escrowPda: PublicKey;
  let escrowBump: number;

  beforeAll(async () => {
    usdcMint = await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      provider.wallet.publicKey,
      null,
      6,
    );

    [escrowPda, escrowBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(movieId)],
      program.programId,
    );
  });

  it("creates the MovieEscrow PDA and vault with the expected initial state", async () => {
    await program.methods
      .initEscrow(movieId, Array.from(contractHash), Array.from(ruleHash), ruleVersion)
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

    const escrow = await program.account.movieEscrow.fetch(escrowPda);

    expect(escrow.movieId).toBe(movieId);
    expect(escrow.authority.toBase58()).toBe(authority.publicKey.toBase58());
    expect(escrow.usdcMint.toBase58()).toBe(usdcMint.toBase58());
    expect(Array.from(escrow.contractHash)).toEqual(Array.from(contractHash));
    expect(Array.from(escrow.ruleHash)).toEqual(Array.from(ruleHash));
    expect(escrow.ruleVersion).toBe(ruleVersion);
    expect(escrow.state).toEqual({ pending: {} });
    expect(escrow.grossIn.toNumber()).toBe(0);
    expect(escrow.pending.toNumber()).toBe(0);
    expect(escrow.allocated.toNumber()).toBe(0);
    expect(escrow.disputed.toNumber()).toBe(0);
    expect(escrow.paidOut.toNumber()).toBe(0);
    expect(escrow.refunded.toNumber()).toBe(0);
    expect(escrow.batchCount).toBe(0);
    expect(escrow.bump).toBe(escrowBump);

    const vaultAccount = await getAccount(provider.connection, escrow.vault);
    expect(vaultAccount.mint.toBase58()).toBe(usdcMint.toBase58());
    expect(vaultAccount.owner.toBase58()).toBe(escrowPda.toBase58());
    expect(Number(vaultAccount.amount)).toBe(0);
  });
});
