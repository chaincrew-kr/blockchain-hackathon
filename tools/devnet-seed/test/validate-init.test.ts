import { createHash } from "node:crypto";

import { web3 } from "@coral-xyz/anchor";
import { describe, expect, it } from "vitest";

import { validateInitEscrowTransaction } from "../src/validate-init.js";

function transaction(
  options: { wrongProgram?: boolean; extra?: boolean } = {},
) {
  const payer = web3.Keypair.generate();
  const authority = web3.Keypair.generate();
  const programId = web3.Keypair.generate().publicKey;
  const discriminator = createHash("sha256")
    .update("global:init_escrow")
    .digest()
    .subarray(0, 8);
  const tx = new web3.Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: web3.Keypair.generate().publicKey.toBase58(),
  }).add(
    new web3.TransactionInstruction({
      programId: options.wrongProgram
        ? web3.Keypair.generate().publicKey
        : programId,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      ],
      data: discriminator,
    }),
  );
  if (options.extra) {
    tx.add(
      web3.SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: authority.publicKey,
        lamports: 1,
      }),
    );
  }
  tx.partialSign(payer);
  return { tx, authority, programId };
}

describe("validateInitEscrowTransaction", () => {
  it("B 서명이 있는 예상 init_escrow만 허용한다", () => {
    const { tx, authority, programId } = transaction();
    expect(() =>
      validateInitEscrowTransaction(tx, authority.publicKey, programId),
    ).not.toThrow();
  });

  it("다른 프로그램이면 거부한다", () => {
    const { tx, authority, programId } = transaction({ wrongProgram: true });
    expect(() =>
      validateInitEscrowTransaction(tx, authority.publicKey, programId),
    ).toThrow(/Program ID/);
  });

  it("추가 명령이 섞이면 거부한다", () => {
    const { tx, authority, programId } = transaction({ extra: true });
    expect(() =>
      validateInitEscrowTransaction(tx, authority.publicKey, programId),
    ).toThrow(/명령이 섞여/);
  });
});
