import { createHash } from "node:crypto";

import { web3 } from "@coral-xyz/anchor";

const INIT_ESCROW_DISCRIMINATOR = createHash("sha256")
  .update("global:init_escrow")
  .digest()
  .subarray(0, 8);

/**
 * 외부에서 받은 base64에 무조건 서명하지 않는다. D가 합의한 프로그램의
 * init_escrow 한 건이고, Agent가 authority signer로만 들어갔는지 확인한다.
 */
export function validateInitEscrowTransaction(
  tx: web3.Transaction,
  authority: web3.PublicKey,
  expectedProgramId: web3.PublicKey,
): void {
  if (!tx.feePayer || !tx.recentBlockhash) {
    throw new Error("트랜잭션에 fee payer 또는 recent blockhash가 없습니다");
  }
  if (tx.instructions.length !== 1) {
    throw new Error(
      `init_escrow 외 명령이 섞여 있습니다 (instructions=${tx.instructions.length})`,
    );
  }

  const instruction = tx.instructions[0];
  if (!instruction) throw new Error("init_escrow instruction이 없습니다");
  if (!instruction.programId.equals(expectedProgramId)) {
    throw new Error(
      `예상하지 않은 Program ID입니다: ${instruction.programId.toBase58()}`,
    );
  }
  if (
    instruction.data.length < INIT_ESCROW_DISCRIMINATOR.length ||
    !instruction.data.subarray(0, 8).equals(INIT_ESCROW_DISCRIMINATOR)
  ) {
    throw new Error("movie_escrow의 init_escrow instruction이 아닙니다");
  }

  const authorityAccount = instruction.keys.find((key) =>
    key.pubkey.equals(authority),
  );
  if (!authorityAccount?.isSigner) {
    throw new Error("Agent 공개키가 authority signer로 포함되지 않았습니다");
  }
  const authoritySignature = tx.signatures.find(({ publicKey }) =>
    publicKey.equals(authority),
  );
  if (!authoritySignature) {
    throw new Error("Agent authority 서명 슬롯이 없습니다");
  }

  const missingOtherSigners = tx.signatures
    .filter(
      ({ publicKey, signature }) => !publicKey.equals(authority) && !signature,
    )
    .map(({ publicKey }) => publicKey.toBase58());
  if (missingOtherSigners.length > 0) {
    throw new Error(
      `B 쪽 선행 서명이 비어 있습니다: ${missingOtherSigners.join(", ")}`,
    );
  }
}
