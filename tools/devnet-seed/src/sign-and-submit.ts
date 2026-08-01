/**
 * [D가 실행] devnet 테스트 escrow 시딩 2단계.
 *
 * B가 build-init-escrow.ts로 만든 partial-sign 트랜잭션(base64)을 읽어
 * D 본인의 agent 키페어(AGENT_KEYPAIR_PATH, MovieEscrow.authority)로 마저
 * 서명하고 devnet에 제출한다. B의 개인키도 D의 개인키도 서로 주고받지 않는다
 * — 트랜잭션(base64)만 주고받는다.
 *
 * 사용 예:
 *   AUTHORITY_KEYPAIR_PATH=.secrets/agent-devnet.json \
 *   TX_FILE=.secrets/devnet-seed-init-escrow.unsigned.b64 \
 *   npm run sign-submit --workspace=@chaincrew/devnet-seed
 *
 * (B가 보낸 base64 문자열을 파일로 저장한 경로를 TX_FILE에 넣으면 된다.
 *  같은 저장소를 쓰고 있다면 B가 만든 .secrets/devnet-seed-init-escrow.unsigned.b64를
 *  그대로 가리켜도 된다 — .secrets/는 git에 안 올라가므로 직접 파일을 공유해야 함.)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { web3 } from "@coral-xyz/anchor";

import { loadKeypairFile, repoRoot, requireEnv } from "./common.js";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const AUTHORITY_KEYPAIR_PATH = requireEnv("AUTHORITY_KEYPAIR_PATH");
const TX_FILE = requireEnv("TX_FILE");

async function main(): Promise<void> {
  const connection = new web3.Connection(RPC_URL, "confirmed");
  const authority = loadKeypairFile(AUTHORITY_KEYPAIR_PATH);
  console.log("authority:", authority.publicKey.toBase58());

  const b64 = readFileSync(resolve(repoRoot, TX_FILE), "utf8").trim();
  const tx = web3.Transaction.from(Buffer.from(b64, "base64"));

  tx.partialSign(authority);

  console.log("트랜잭션 제출 중...");
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
  });
  await connection.confirmTransaction(signature, "confirmed");

  console.log("\n=== init_escrow 완료 ===");
  console.log("signature:", signature);
  console.log(
    `explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`,
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exit(1);
});
