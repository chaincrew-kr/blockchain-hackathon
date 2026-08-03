// src/lib/chain.ts
//
// [A] STAGE 1 실연동 — PurchasePage가 Phantom 지갑으로 movie_escrow의
// deposit/refund_pending을 직접 호출한다. B가 만든 IDL(packages/schema/idl)이
// program id("address" 필드)까지 담고 있어 localnet/devnet 전환은 RPC URL만
// 바꾸면 된다 (Anchor.toml이 둘 다 같은 program id를 씀).
//
// screening_id/seat 인자는 D의 해시 연속성 검증(P5, 이슈 #8)이 기대하는
// 원천 필드라 임의로 생략할 수 없다 — deposit.rs 문서 주석 참고.
import {
  AnchorError,
  AnchorProvider,
  BN,
  Program,
  type Wallet as AnchorWallet,
} from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import idl from "@chaincrew/schema/idl/movie_escrow.json";
import type { MovieEscrow } from "@chaincrew/schema/idl/movie_escrow";
import { hexToBytes32 } from "./hash";

const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
const CLUSTER = import.meta.env.VITE_SOLANA_CLUSTER ?? "localnet";

/** B/D가 init_escrow로 만든 데모 영화의 movieId — mocks/demo.ts와 동일 기본값. */
export const DEMO_MOVIE_ID = import.meta.env.VITE_MOVIE_ID ?? "indie-2026-001";

/** IDL의 "address" 필드가 곧 program id — Anchor.toml localnet/devnet 공통값. */
const PROGRAM_ID = new PublicKey(idl.address);

export function explorerTxUrl(signature: string): string {
  if (CLUSTER === "localnet") {
    return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`;
  }
  return `https://explorer.solana.com/tx/${signature}?cluster=${CLUSTER}`;
}

/** Phantom이 window에 주입하는 provider의 최소 형태 — wallet-adapter 없이 직접 사용. */
export interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: PublicKey | null;
  connect(opts?: {
    onlyIfTrusted?: boolean;
  }): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  signTransaction<T extends Transaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction>(txs: T[]): Promise<T[]>;
}

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

export class WalletNotFoundError extends Error {
  constructor() {
    super("Phantom 지갑이 설치되어 있지 않습니다");
    this.name = "WalletNotFoundError";
  }
}

export function getPhantomProvider(): PhantomProvider {
  const provider = window.solana;
  if (!provider?.isPhantom) throw new WalletNotFoundError();
  return provider;
}

export function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

/** Phantom provider는 AnchorProvider가 기대하는 Wallet 형태(publicKey·signTransaction·signAllTransactions)를 그대로 만족한다. */
function toAnchorProvider(wallet: PhantomProvider): AnchorProvider {
  return new AnchorProvider(
    getConnection(),
    wallet as unknown as AnchorWallet,
    {
      commitment: "confirmed",
    },
  );
}

function getProgram(anchorProvider: AnchorProvider): Program<MovieEscrow> {
  return new Program(idl as MovieEscrow, anchorProvider);
}

export function findEscrowPda(movieId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(movieId)],
    PROGRAM_ID,
  )[0];
}

export interface SeatTicket {
  screeningId: string;
  seat: string;
  /** USDC 최소 단위 정수 (1 USDC = 1_000_000) — lib/usdc.ts의 toUsdcSmallestUnit() 결과를 그대로 넘긴다. */
  amountSmallestUnit: number;
}

/** deposit/refund_pending 호출에 공통으로 필요한 계정을 한 번만 조회한다. */
async function resolveEscrowAccounts(
  program: Program<MovieEscrow>,
  movieId: string,
  payer: PublicKey,
) {
  const escrowPda = findEscrowPda(movieId);
  let escrow;
  try {
    escrow = await program.account.movieEscrow.fetch(escrowPda);
  } catch (error) {
    throw new Error(
      `에스크로 계정이 아직 초기화되지 않았습니다 (movieId="${movieId}") — B/D의 init_escrow 실행 대기`,
      { cause: error },
    );
  }
  const payerTokenAccount = getAssociatedTokenAddressSync(
    escrow.usdcMint,
    payer,
  );
  return { escrowPda, escrow, payerTokenAccount };
}

/**
 * 회차별 좌석 티켓을 한 트랜잭션에 담아 한 번의 서명으로 처리한다.
 * 관객의 USDC ATA가 없으면(첫 구매) idempotent 생성 명령을 앞에 붙인다.
 */
export async function depositTickets(
  wallet: PhantomProvider,
  movieId: string,
  tickets: SeatTicket[],
): Promise<string> {
  if (tickets.length === 0) throw new Error("결제할 좌석이 없습니다");
  const payer = wallet.publicKey;
  if (!payer) throw new WalletNotFoundError();

  const anchorProvider = toAnchorProvider(wallet);
  const program = getProgram(anchorProvider);
  const { escrowPda, escrow, payerTokenAccount } = await resolveEscrowAccounts(
    program,
    movieId,
    payer,
  );

  const depositIxs = await Promise.all(
    tickets.map((t) =>
      program.methods
        .deposit(t.screeningId, t.seat, new BN(t.amountSmallestUnit))
        // escrow.movie_id를 시드로 쓰는 PDA라 Anchor의 자동 해석이 되지 않는다(순환 참조) —
        // accountsPartial로 우리가 이미 계산한 주소를 명시적으로 넘긴다.
        .accountsPartial({
          payer,
          escrow: escrowPda,
          payerTokenAccount,
          vault: escrow.vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction(),
    ),
  );

  const ensureAta = createAssociatedTokenAccountIdempotentInstruction(
    payer,
    payerTokenAccount,
    payer,
    escrow.usdcMint,
  );

  const tx = new Transaction().add(
    ensureAta,
    ...(depositIxs as TransactionInstruction[]),
  );
  return anchorProvider.sendAndConfirm(tx);
}

/** 결제한 좌석들을 환불한다 — Pending 자금의 유일한 출구 (refund_pending.rs). */
export async function refundPendingTickets(
  wallet: PhantomProvider,
  movieId: string,
  tickets: SeatTicket[],
): Promise<string> {
  if (tickets.length === 0) throw new Error("환불할 좌석이 없습니다");
  const payer = wallet.publicKey;
  if (!payer) throw new WalletNotFoundError();

  const anchorProvider = toAnchorProvider(wallet);
  const program = getProgram(anchorProvider);
  const { escrowPda, escrow, payerTokenAccount } = await resolveEscrowAccounts(
    program,
    movieId,
    payer,
  );

  const refundIxs = await Promise.all(
    tickets.map((t) =>
      program.methods
        .refundPending(t.screeningId, t.seat, new BN(t.amountSmallestUnit))
        // escrow.movie_id를 시드로 쓰는 PDA라 Anchor의 자동 해석이 되지 않는다(순환 참조) —
        // accountsPartial로 우리가 이미 계산한 주소를 명시적으로 넘긴다.
        .accountsPartial({
          payer,
          escrow: escrowPda,
          payerTokenAccount,
          vault: escrow.vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction(),
    ),
  );

  const tx = new Transaction().add(...(refundIxs as TransactionInstruction[]));
  return anchorProvider.sendAndConfirm(tx);
}

export interface InitEscrowParams {
  movieId: string;
  /** 상영관 지갑 주소 — D의 상영관별 이력 조회(getProgramAccounts theater memcmp)에 쓰인다. */
  theater: PublicKey;
  /** BackofficePage에서 이미 계산해둔 hex 문자열 (lib/hash.ts) */
  contractHash: string;
  ruleHash: string;
  ruleVersion: number;
  /** USDC 최소 단위. 계약서에 MG·투자 조항이 없으면 0. */
  mgAmountSmallestUnit: number;
  investmentAmountSmallestUnit: number;
}

/**
 * STAGE 0 마무리 — 양측 승인된 규칙 해시를 init_escrow로 온체인에 등록한다.
 *
 * usdc_mint는 기존에 존재하는 계정이어야 하는 program 제약(init_escrow.rs)이라,
 * 데모에서는 이 호출 안에서 새 테스트 민트를 만들어(devnet-seed의
 * build-init-escrow.ts와 동일한 방식) 같은 트랜잭션에 담아 보낸다.
 *
 * authority는 원래 정산 에이전트(D)의 별도 서명이 필요하지만(devnet-seed가
 * partial-sign으로 나누는 이유), 이 화면은 연결된 지갑 하나로 완결하는 데모
 * 경로라 payer와 authority를 같은 지갑으로 둔다 — 실제 운영에서는 에이전트
 * 지갑의 별도 서명을 받는 흐름으로 바꿔야 한다.
 */
export async function initEscrow(
  wallet: PhantomProvider,
  params: InitEscrowParams,
): Promise<{ signature: string; usdcMint: PublicKey }> {
  const payer = wallet.publicKey;
  if (!payer) throw new WalletNotFoundError();

  const anchorProvider = toAnchorProvider(wallet);
  const program = getProgram(anchorProvider);
  const connection = anchorProvider.connection;

  const mintKeypair = Keypair.generate();
  const mintRent = await getMinimumBalanceForRentExemptMint(connection);
  const createMintAccountIx = SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: mintKeypair.publicKey,
    space: MINT_SIZE,
    lamports: mintRent,
    programId: TOKEN_PROGRAM_ID,
  });
  const initMintIx = createInitializeMint2Instruction(
    mintKeypair.publicKey,
    6,
    payer,
    null,
  );

  const escrowPda = findEscrowPda(params.movieId);
  const vault = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    escrowPda,
    true, // owner가 PDA라 curve 밖 주소 — allowOwnerOffCurve
  );

  const initEscrowIx = await program.methods
    .initEscrow(
      params.movieId,
      params.theater,
      Array.from(hexToBytes32(params.contractHash)),
      Array.from(hexToBytes32(params.ruleHash)),
      params.ruleVersion,
      new BN(params.mgAmountSmallestUnit),
      new BN(params.investmentAmountSmallestUnit),
    )
    // escrow.movie_id를 시드로 쓰는 PDA라 Anchor의 자동 해석이 되지 않는다 —
    // deposit/refundPending과 같은 이유로 accountsPartial을 쓴다.
    .accountsPartial({
      payer,
      escrow: escrowPda,
      usdcMint: mintKeypair.publicKey,
      vault,
      authority: payer,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction().add(
    createMintAccountIx,
    initMintIx,
    initEscrowIx,
  );
  const signature = await anchorProvider.sendAndConfirm(tx, [mintKeypair]);
  return { signature, usdcMint: mintKeypair.publicKey };
}

/** programs/movie_escrow/src/error.rs의 EscrowError를 사람이 읽을 문장으로 (D의 anchor-gateway.ts ESCROW_ERROR_HINTS와 같은 취지). */
const ESCROW_ERROR_HINTS: Record<string, string> = {
  InvalidState: "현재 에스크로 상태에서는 실행할 수 없는 요청입니다",
  MathOverflow: "정산 계산에서 정수 오버플로가 발생했습니다",
  RuleHashMismatch: "승인된 정산 규칙 해시와 일치하지 않습니다",
};

export function describeChainError(error: unknown): string {
  if (error instanceof WalletNotFoundError) {
    return `${error.message} — https://phantom.app 에서 설치 후 다시 시도하세요`;
  }
  if (error instanceof AnchorError) {
    const code = error.error.errorCode.code;
    const hint = ESCROW_ERROR_HINTS[code];
    return hint ? `${code} — ${hint}` : `${code} (${error.error.errorMessage})`;
  }
  if (error instanceof Error) {
    if (/user rejected/i.test(error.message))
      return "지갑에서 서명을 취소했습니다";
    return error.message;
  }
  // Phantom의 지갑 프로바이더는 승인 요청이 겹치면 Error가 아닌
  // 순수 객체({code, message})를 던진다 — 위 instanceof Error 분기를
  // 건너뛰므로 별도로 잡아줘야 원인을 알 수 있는 메시지가 나온다.
  if (typeof error === "object" && error !== null && "message" in error) {
    const { code, message } = error as { code?: number; message: unknown };
    if (code === -32002)
      return "지갑에 이미 대기 중인 연결 요청이 있습니다 — Phantom 확장을 열어 처리한 뒤 다시 시도하세요";
    if (code === 4001) return "지갑에서 서명을 취소했습니다";
    return String(message);
  }
  return "알 수 없는 오류가 발생했습니다";
}
