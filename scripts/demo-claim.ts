import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor"; 
import BN from "bn.js";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

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

const DEPOSIT_AMOUNT = 270_000_000; // 270 USDC — 데모와 같은 규모
const RULE_VERSION = 1;
const THEATER_BPS = 5000;
const DISTRIBUTOR_BPS = 5000;
const DISTRIBUTION_FEE_BPS = 1000;
const INVESTOR_PROFIT_BPS = 0;

const RULE_HASH = createHash("sha256")
  .update(
    [
      RULE_VERSION,
      THEATER_BPS,
      DISTRIBUTOR_BPS,
      DISTRIBUTION_FEE_BPS,
      INVESTOR_PROFIT_BPS,
    ].join("|"),
  )
  .digest();

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = new Program(idl, provider);
const wallet = provider.wallet as anchor.Wallet;

const usdc = (n: any) => (Number(n) / 1_000_000).toFixed(6);
const inv = (e: any) =>
  Number(e.pending) + Number(e.allocated) + Number(e.disputed) +
  Number(e.paidOut) + Number(e.refunded);
const line = () => console.log("─".repeat(52));
const explorer = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

function pda(seeds: (Buffer | Uint8Array)[]) {
  return PublicKey.findProgramAddressSync(seeds, program.programId)[0];
}

async function main() {
  const movieId = `rehearsal-${Date.now()}`;
  const theater = Keypair.generate();
  const distributor = Keypair.generate();
  const producer = Keypair.generate();
  const investor = Keypair.generate();

  const escrowPda = pda([Buffer.from("escrow"), Buffer.from(movieId)]);
  const allocPda = (role: number) =>
    pda([
      Buffer.from("allocation"),
      Buffer.from(movieId),
      Buffer.from([role]),
    ]);

  console.log(`\n영화 ID: ${movieId}`);
  console.log(`Escrow:  ${escrowPda.toString()}\n`);

  // ── 셋업 ────────────────────────────────────────────────
  console.log("테스트 USDC 민트 생성 중...");
  const usdcMint = await createMint(
    provider.connection,
    wallet.payer,
    wallet.publicKey,
    null,
    6,
  );

  const payerAta = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    usdcMint,
    wallet.publicKey,
  );
  await mintTo(
    provider.connection,
    wallet.payer,
    usdcMint,
    payerAta.address,
    wallet.publicKey,
    DEPOSIT_AMOUNT,
  );

  console.log("init_escrow ...");
  await program.methods
    .initEscrow(
      movieId,
      Keypair.generate().publicKey,
      Array.from(new Uint8Array(32).fill(1)),
      Array.from(RULE_HASH),
      RULE_VERSION,
      new BN(30_000_000),   // MG 30 USDC
      new BN(50_000_000),   // 투자 원금 50 USDC
    )
    .accounts({
      payer: wallet.publicKey,
      escrow: escrowPda,
      usdcMint,
      authority: wallet.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: PublicKey.default,
    })
    .rpc();

  const escrowInit = await program.account.movieEscrow.fetch(escrowPda);

  console.log("deposit (270 USDC) ...");
  await program.methods
    .deposit("SCR-1", "A16", new BN(DEPOSIT_AMOUNT))
    .accounts({
      payer: wallet.publicKey,
      escrow: escrowPda,
      payerTokenAccount: payerAta.address,
      vault: escrowInit.vault,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("verify_escrow ...");
  await program.methods
    .verifyEscrow()
    .accounts({ authority: wallet.publicKey, escrow: escrowPda })
    .rpc();

  console.log("settle_batch ...");
  await program.methods
    .settleBatch(
      "SCR-1",
      new BN(DEPOSIT_AMOUNT),
      THEATER_BPS,
      DISTRIBUTOR_BPS,
      DISTRIBUTION_FEE_BPS,
      INVESTOR_PROFIT_BPS,
    )
    .accounts({
      authority: wallet.publicKey,
      escrow: escrowPda,
      theaterAllocation: allocPda(0),
      theaterWallet: theater.publicKey,
      distributorAllocation: allocPda(1),
      distributorWallet: distributor.publicKey,
      producerAllocation: allocPda(2),
      producerWallet: producer.publicKey,
      investorAllocation: allocPda(3),
      investorWallet: investor.publicKey,
      systemProgram: PublicKey.default,
    })
    .rpc();

  // ── 여기서부터 데모 ─────────────────────────────────────
  const theaterAta = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    usdcMint,
    theater.publicKey,
  );

  const alloc = await program.account.allocation.fetch(allocPda(0));
  const escrowBefore = await program.account.movieEscrow.fetch(escrowPda);
  const balBefore = await getAccount(provider.connection, theaterAta.address);

  line();
  console.log("정산 결과");
  line();
  console.log(`극장 확정 몫       ${usdc(alloc.claimable)} USDC`);
  console.log(`이미 인출한 금액    ${usdc(alloc.claimed)} USDC`);
  console.log(`극장 지갑 잔고     ${usdc(balBefore.amount)} USDC`);
  console.log(`금고 allocated     ${usdc(escrowBefore.allocated)} USDC`);
  console.log(`금고 paidOut       ${usdc(escrowBefore.paidOut)} USDC`);

  line();
  console.log(`인출 실행 — claim(${usdc(alloc.claimable)})`);
  line();

  const sig = await program.methods
    .claim(alloc.claimable)
    .accounts({
      beneficiary: theater.publicKey,
      escrow: escrowPda,
      allocation: allocPda(0),
      beneficiaryTokenAccount: theaterAta.address,
      vault: escrowBefore.vault,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([theater])
    .rpc();

  const balAfter = await getAccount(provider.connection, theaterAta.address);
  const escrowAfter = await program.account.movieEscrow.fetch(escrowPda);

  console.log(`성공`);
  console.log(`극장 지갑 잔고     ${usdc(balBefore.amount)} → ${usdc(balAfter.amount)} USDC`);
  console.log(`금고 allocated     ${usdc(escrowBefore.allocated)} → ${usdc(escrowAfter.allocated)}`);
  console.log(`금고 paidOut       ${usdc(escrowBefore.paidOut)} → ${usdc(escrowAfter.paidOut)}`);
  console.log(`\n${explorer(sig)}`);

  line();
  console.log("초과 인출 시도 — 남은 몫보다 1 많이 요청");
  line();

  try {
    await program.methods
      .claim(new BN(1))
      .accounts({
        beneficiary: theater.publicKey,
        escrow: escrowPda,
        allocation: allocPda(0),
        beneficiaryTokenAccount: theaterAta.address,
        vault: escrowAfter.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([theater])
      .rpc();
    console.log("문제 — 거부됐어야 하는데 통과함");
  } catch (e: any) {
    const msg = String(e?.error?.errorMessage ?? e?.message ?? e);
    console.log(`거부됨 — ${msg.split("\n")[0]}`);
  }

  const balFinal = await getAccount(provider.connection, theaterAta.address);
  console.log(`극장 지갑 잔고     ${usdc(balFinal.amount)} USDC (변화 없음)\n`);

  const escrowFinal = await program.account.movieEscrow.fetch(escrowPda);

  // ── 분쟁 시나리오 ───────────────────────────────────────
  line();
  console.log("분쟁 발생 — 제작사 몫 일부 보류");
  line();

  const producerAta = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    usdcMint,
    producer.publicKey,
  );

  const prodAlloc = await program.account.allocation.fetch(allocPda(2));
  const DISPUTE = new BN(20_000_000); // 20 USDC 보류

  console.log(`제작사 확정 몫     ${usdc(prodAlloc.claimable)} USDC`);
  console.log(`보류 금액          ${usdc(DISPUTE)} USDC`);

  await program.methods
    .markDisputed(DISPUTE)
    .accounts({
      authority: wallet.publicKey,
      escrow: escrowPda,
      allocation: allocPda(2),
    })
    .rpc();

  const prodMarked = await program.account.allocation.fetch(allocPda(2));
  const escrowMarked = await program.account.movieEscrow.fetch(escrowPda);
  const available =
    Number(prodMarked.claimable) - Number(prodMarked.claimed) - Number(prodMarked.disputed);

  console.log(`제작사 claimable   ${usdc(prodMarked.claimable)} USDC`);
  console.log(`제작사 disputed    0 → ${usdc(prodMarked.disputed)} USDC`);
  console.log(`지금 찾을 수 있는  ${usdc(available)} USDC`);
  console.log(`금고 disputed      ${usdc(escrowMarked.disputed)} USDC`);

  line();
  console.log("보류 중 전액 인출 시도");
  line();

  try {
    await program.methods
      .claim(prodAlloc.claimable)
      .accounts({
        beneficiary: producer.publicKey,
        escrow: escrowPda,
        allocation: allocPda(2),
        beneficiaryTokenAccount: producerAta.address,
        vault: escrowMarked.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([producer])
      .rpc();
    console.log("문제 — 거부됐어야 함");
  } catch (e: any) {
    const msg = String(e?.error?.errorMessage ?? e?.message ?? e);
    console.log(`거부됨 — ${msg.split("\n")[0]}`);
    console.log();
  }

  line();
  console.log("분쟁 해결 — 승인");
  line();

  const rSig = await program.methods
    .resolveDispute(true)
    .accounts({
      authority: wallet.publicKey,
      escrow: escrowPda,
      allocation: allocPda(2),
    })
    .rpc();

  const prodResolved = await program.account.allocation.fetch(allocPda(2));
  const escrowResolved = await program.account.movieEscrow.fetch(escrowPda);

  console.log(`제작사 disputed    ${usdc(prodMarked.disputed)} → ${usdc(prodResolved.disputed)}`);
  console.log(`금고 disputed      ${usdc(escrowMarked.disputed)} → ${usdc(escrowResolved.disputed)}`);
  console.log(`금고 allocated     ${usdc(escrowMarked.allocated)} → ${usdc(escrowResolved.allocated)}`);
  console.log(`\n${explorer(rSig)}`);

  line();
  console.log("해제 후 전액 인출");
  line();

  await program.methods
    .claim(prodResolved.claimable)
    .accounts({
      beneficiary: producer.publicKey,
      escrow: escrowPda,
      allocation: allocPda(2),
      beneficiaryTokenAccount: producerAta.address,
      vault: escrowResolved.vault,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([producer])
    .rpc();

  const prodBal = await getAccount(provider.connection, producerAta.address);
  console.log(`제작사 지갑 잔고   0 → ${usdc(prodBal.amount)} USDC`);

  // ──────────────────────────────────────────────────────────

  console.log(`검산  ${usdc(inv(escrowFinal))} = 입금 ${usdc(escrowFinal.grossIn)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});