/**
 * [B가 실행] devnet에 테스트 escrow를 시딩하는 1단계.
 *
 * 1. 테스트 USDC 민트 생성(devnet, 6 decimals, 우리 소유)
 * 2. init_escrow 트랜잭션을 만들고 payer(B)만 먼저 서명
 * 3. authority(D의 agent 지갑)는 서명이 안 돼 있으므로, base64로 직렬화해
 *    D에게 전달 — D가 sign-and-submit.ts로 나머지 서명을 채워 제출한다.
 *
 * init_escrow의 authority가 Signer라서 B 혼자 완결할 수 없다(D의 개인키가
 * 필요). 개인키를 주고받지 않기 위해 부분 서명(partial sign) 방식을 쓴다.
 *
 * 사용 예:
 *   THEATER_WALLET=<theater 지갑 주소> \
 *   AUTHORITY_PUBKEY=<D의 agent 지갑 공개키> \
 *   npm run build-init --workspace=@chaincrew/devnet-seed
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { BN, Program, AnchorProvider, Wallet, web3 } from "@coral-xyz/anchor";
import { createMint } from "@solana/spl-token";

import {
  computeRuleHash,
  escrowPda,
  loadIdl,
  loadKeypairFile,
  programMethod,
  repoRoot,
  requireEnv,
} from "./common.js";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const PAYER_KEYPAIR_PATH =
  process.env.PAYER_KEYPAIR_PATH ??
  `${process.env.HOME}/.config/solana/id.json`;
const PROGRAM_ID = new web3.PublicKey(requireEnv("SOLANA_PROGRAM_ID"));
const MOVIE_ID = process.env.MOVIE_ID ?? `devnet-demo-${Date.now()}`;
const THEATER_WALLET = new web3.PublicKey(requireEnv("THEATER_WALLET"));
const AUTHORITY_PUBKEY = new web3.PublicKey(requireEnv("AUTHORITY_PUBKEY"));

// D의 apps/agent/.env.example 기본값과 반드시 일치해야 한다 — 다르면
// settle_batch 호출 시 RuleHashMismatch로 실패한다.
const RULE_VERSION = Number(process.env.RULE_VERSION ?? 1);
const THEATER_BPS = Number(process.env.THEATER_BPS ?? 5000);
const DISTRIBUTOR_BPS = Number(process.env.DISTRIBUTOR_BPS ?? 5000);
const DISTRIBUTION_FEE_BPS = Number(process.env.DISTRIBUTION_FEE_BPS ?? 1000);
const INVESTOR_PROFIT_BPS = Number(process.env.INVESTOR_PROFIT_BPS ?? 6000);
const MG_AMOUNT = Number(process.env.MG_AMOUNT ?? 0);
const INVESTMENT_AMOUNT = Number(process.env.INVESTMENT_AMOUNT ?? 0);

const OUT_TX_PATH = resolve(
  repoRoot,
  ".secrets/devnet-seed-init-escrow.unsigned.b64",
);
const OUT_STATE_PATH = resolve(repoRoot, ".secrets/devnet-seed-state.json");

async function main(): Promise<void> {
  const connection = new web3.Connection(RPC_URL, "confirmed");
  const payer = loadKeypairFile(PAYER_KEYPAIR_PATH);
  console.log("payer (수수료·rent 지불):", payer.publicKey.toBase58());
  console.log("authority (D agent, 서명 대기):", AUTHORITY_PUBKEY.toBase58());
  console.log("theater wallet:", THEATER_WALLET.toBase58());
  console.log("movie_id:", MOVIE_ID);

  console.log("\n[1/2] 테스트 USDC 민트 생성 중...");
  const usdcMint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    6,
  );
  console.log("  mint:", usdcMint.toBase58());

  const provider = new AnchorProvider(connection, new Wallet(payer), {
    commitment: "confirmed",
  });
  const idl = loadIdl(PROGRAM_ID);
  const program = new Program(idl, provider);

  const escrow = escrowPda(MOVIE_ID, PROGRAM_ID);
  const vault = web3.PublicKey.findProgramAddressSync(
    [
      escrow.toBuffer(),
      new web3.PublicKey(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      ).toBuffer(),
      usdcMint.toBuffer(),
    ],
    new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
  )[0];

  const ruleHash = computeRuleHash({
    ruleVersion: RULE_VERSION,
    theaterBps: THEATER_BPS,
    distributorBps: DISTRIBUTOR_BPS,
    distributionFeeBps: DISTRIBUTION_FEE_BPS,
    investorProfitBps: INVESTOR_PROFIT_BPS,
  });
  // 계약서 원문 해시는 데모용 더미 — 실제 계약서 추출 파이프라인(A) 범위 밖.
  const { createHash } = await import("node:crypto");
  const contractHash = createHash("sha256")
    .update(`devnet-seed-contract:${MOVIE_ID}`)
    .digest();

  console.log("[2/2] init_escrow 트랜잭션 생성 + payer 서명...");
  const ix = await programMethod(
    program,
    "initEscrow",
    MOVIE_ID,
    THEATER_WALLET,
    Array.from(contractHash),
    Array.from(ruleHash),
    RULE_VERSION,
    new BN(MG_AMOUNT),
    new BN(INVESTMENT_AMOUNT),
  )
    .accountsStrict({
      payer: payer.publicKey,
      escrow,
      usdcMint,
      vault,
      authority: AUTHORITY_PUBKEY,
      tokenProgram: new web3.PublicKey(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      ),
      associatedTokenProgram: new web3.PublicKey(
        "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
      ),
      systemProgram: web3.SystemProgram.programId,
    })
    .instruction();

  const tx = new web3.Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.partialSign(payer);

  const serialized = tx.serialize({ requireAllSignatures: false });
  const b64 = serialized.toString("base64");
  writeFileSync(OUT_TX_PATH, b64, "utf8");

  writeFileSync(
    OUT_STATE_PATH,
    JSON.stringify(
      {
        movieId: MOVIE_ID,
        programId: PROGRAM_ID.toBase58(),
        rpcUrl: RPC_URL,
        usdcMint: usdcMint.toBase58(),
        escrow: escrow.toBase58(),
        vault: vault.toBase58(),
        theaterWallet: THEATER_WALLET.toBase58(),
        authorityPubkey: AUTHORITY_PUBKEY.toBase58(),
        ruleVersion: RULE_VERSION,
        theaterBps: THEATER_BPS,
        distributorBps: DISTRIBUTOR_BPS,
        distributionFeeBps: DISTRIBUTION_FEE_BPS,
        investorProfitBps: INVESTOR_PROFIT_BPS,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log("\n=== 완료 — D에게 전달할 것 ===");
  console.log(`1. 서명 안 된 트랜잭션 파일: ${OUT_TX_PATH}`);
  console.log("   (base64 문자열이라 그대로 복사해서 보내도 됨)");
  console.log("2. D가 tools/devnet-seed의 sign-submit 스크립트로 서명·제출");
  console.log(
    "   ⚠ blockhash 유효시간이 짧습니다(~1~2분) — 받는 즉시 서명·제출하지 않으면",
  );
  console.log("     이 파일을 다시 생성해야 합니다.");
  console.log("\n=== escrow 정보 (나중에 fund-escrow, D의 .env에 필요) ===");
  console.log("movie_id:", MOVIE_ID);
  console.log("usdc mint:", usdcMint.toBase58());
  console.log("escrow PDA:", escrow.toBase58());
  console.log(`상태는 ${OUT_STATE_PATH}에도 저장됨`);
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exit(1);
});
