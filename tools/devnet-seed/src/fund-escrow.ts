/**
 * [B가 실행] devnet 테스트 escrow 시딩 3단계 — init_escrow가 devnet에
 * confirm된 뒤 실행한다.
 *
 * payer 본인의 USDC(테스트 민트)를 찍어서(mintTo) 자기 자신을 "관객"으로
 * 삼아 deposit을 호출한다. deposit은 payer 서명만 필요해서(authority 불필요)
 * D를 기다릴 필요 없이 B 혼자 끝낼 수 있다.
 *
 * 실행 후 escrow.pending이 amount만큼 늘어나서 D의 settle_batch가 처리할
 * 대상이 생긴다.
 *
 * 사용 예:
 *   AMOUNT=10000000 npm run fund --workspace=@chaincrew/devnet-seed
 *   (10_000_000 = 10 USDC, 6 decimals 기준)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { BN, Program, AnchorProvider, Wallet, web3 } from "@coral-xyz/anchor";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

import { loadIdl, loadKeypairFile, programMethod, repoRoot } from "./common.js";

const PAYER_KEYPAIR_PATH =
  process.env.PAYER_KEYPAIR_PATH ??
  `${process.env.HOME}/.config/solana/id.json`;
const AMOUNT = Number(process.env.AMOUNT ?? 10_000_000); // 기본 10 USDC
const SCREENING_ID = process.env.SCREENING_ID ?? "devnet-seed-screening-1";
const SEAT = process.env.SEAT ?? "A1";

interface SeedState {
  movieId: string;
  programId: string;
  rpcUrl: string;
  usdcMint: string;
  escrow: string;
  vault: string;
}

function loadState(): SeedState {
  const path = resolve(repoRoot, ".secrets/devnet-seed-state.json");
  return JSON.parse(readFileSync(path, "utf8")) as SeedState;
}

async function main(): Promise<void> {
  const state = loadState();
  const connection = new web3.Connection(state.rpcUrl, "confirmed");
  const payer = loadKeypairFile(PAYER_KEYPAIR_PATH);
  const usdcMint = new web3.PublicKey(state.usdcMint);
  const escrow = new web3.PublicKey(state.escrow);
  const vault = new web3.PublicKey(state.vault);
  const programId = new web3.PublicKey(state.programId);

  console.log("movie_id:", state.movieId);
  console.log("payer(=구매자 역할):", payer.publicKey.toBase58());
  console.log("amount:", AMOUNT, "(6 decimals 기준)");

  console.log("\n[1/2] 구매자 토큰 계좌 확인 + 테스트 USDC 발행...");
  const payerTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    usdcMint,
    payer.publicKey,
  );
  await mintTo(
    connection,
    payer,
    usdcMint,
    payerTokenAccount.address,
    payer,
    AMOUNT,
  );
  console.log("  payer ATA:", payerTokenAccount.address.toBase58());

  const provider = new AnchorProvider(connection, new Wallet(payer), {
    commitment: "confirmed",
  });
  const idl = loadIdl(programId);
  const program = new Program(idl, provider);

  console.log("[2/2] deposit 호출...");
  const signature = await programMethod(
    program,
    "deposit",
    SCREENING_ID,
    SEAT,
    new BN(AMOUNT),
  )
    .accountsStrict({
      payer: payer.publicKey,
      escrow,
      payerTokenAccount: payerTokenAccount.address,
      vault,
      tokenProgram: new web3.PublicKey(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      ),
    })
    .rpc();

  console.log("\n=== deposit 완료 ===");
  console.log("signature:", signature);
  console.log(
    `explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`,
  );
  console.log(
    "\n이제 escrow.pending에 잔액이 있습니다 — D가 settle_batch를 호출할 수 있습니다" +
      "(D 코드가 먼저 상태를 보고 필요하면 verify_escrow도 자동 호출함).",
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exit(1);
});
