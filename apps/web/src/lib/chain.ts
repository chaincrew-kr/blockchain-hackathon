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
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import idl from "@chaincrew/schema/idl/movie_escrow.json";
import type { MovieEscrow } from "@chaincrew/schema/idl/movie_escrow";

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
  return "알 수 없는 오류가 발생했습니다";
}
