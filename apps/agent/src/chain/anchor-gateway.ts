/** IDL 기반 movie_escrow 실제 호출 어댑터. */
import { readFileSync } from "node:fs";

import {
  AnchorError,
  AnchorProvider,
  Program,
  Wallet,
  web3,
  type BN as AnchorBN,
  type Idl,
} from "@coral-xyz/anchor";
import anchor from "@coral-xyz/anchor";
import type { OnchainHistorySummary } from "@chaincrew/schema";

import { ChainCallError } from "../errors.js";
import { logger, type Logger } from "../logger.js";
import type { HistoryProvider } from "../risk-check/history.js";
import type { ChainGateway, SettleBatchResult } from "./gateway.js";
import { loadKeypairFile } from "./keypair.js";

// Anchor 0.32의 타입 선언은 BN named export를 노출하지만 Node ESM 런타임에서는
// default CJS namespace에만 있다.
const { BN } = anchor;

export interface AnchorGatewayConfig {
  rpcUrl: string;
  programId: string;
  keypairPath: string;
  idlPath: string;
  movieId: string;
  theaterWallet: string;
  distributorWallet: string;
  producerWallet: string;
  investorWallet: string;
  theaterBps: number;
  distributorBps: number;
  distributionFeeBps: number;
  investorProfitBps: number;
  commitment?: web3.Commitment;
}

type Instruction = "verify_escrow" | "settle_batch" | "mark_disputed";
type Role = "theater" | "distributor" | "producer" | "investor";

const ROLE_INDEX: Record<Role, number> = {
  theater: 0,
  distributor: 1,
  producer: 2,
  investor: 3,
};

interface MovieEscrowAccount {
  theater: web3.PublicKey;
  grossIn: AnchorBN;
  pending: AnchorBN;
  allocated: AnchorBN;
  disputed: AnchorBN;
  paidOut: AnchorBN;
  refunded: AnchorBN;
  batchCount: number;
  disputeCount: number;
  state: Record<string, unknown>;
}

interface AllocationAccount {
  claimable: AnchorBN;
}

interface AccountClientLike {
  fetchNullable(address: web3.PublicKey): Promise<unknown | null>;
  all(): Promise<Array<{ account: unknown }>>;
}

interface MethodBuilderLike {
  accountsStrict(accounts: Record<string, web3.PublicKey>): {
    rpc(): Promise<string>;
  };
}

const ESCROW_ERROR_HINTS: Record<string, string> = {
  ExceedsClaimable: "인출 또는 보류 요청이 사용 가능한 잔액을 초과했습니다",
  InvalidState: "현재 에스크로 상태에서는 실행할 수 없는 instruction입니다",
  MathOverflow: "정산 계산에서 정수 오버플로가 발생했습니다",
  RuleHashMismatch: "승인된 정산 규칙 해시와 호출 인자가 일치하지 않습니다",
  Unauthorized: "에이전트 authority 또는 권리자 지갑이 일치하지 않습니다",
};

function toChainCallError(
  error: unknown,
  instruction: Instruction,
  screeningId: string,
): ChainCallError {
  let detail = "체인 호출이 실패했습니다";
  if (error instanceof AnchorError) {
    const code = error.error.errorCode.code;
    detail = ESCROW_ERROR_HINTS[code]
      ? `${code} — ${ESCROW_ERROR_HINTS[code]}`
      : `${code} (${error.error.errorMessage})`;
  } else if (error instanceof web3.SendTransactionError) {
    detail = "트랜잭션 전송이 거부되었습니다 (RPC 또는 시뮬레이션 실패)";
  } else if (error instanceof Error) {
    detail = error.message;
  }
  return new ChainCallError(
    `${instruction} failed for ${screeningId}: ${detail}`,
    instruction,
    { cause: error },
  );
}

function asSafeNumber(value: AnchorBN | number): number {
  const n = typeof value === "number" ? value : value.toNumber();
  if (!Number.isSafeInteger(n)) {
    throw new Error("온체인 u64 값이 JavaScript 안전 정수 범위를 초과했습니다");
  }
  return n;
}

function validateBps(config: AnchorGatewayConfig): void {
  const values = [
    config.theaterBps,
    config.distributorBps,
    config.distributionFeeBps,
    config.investorProfitBps,
  ];
  if (values.some((v) => !Number.isInteger(v) || v < 0 || v > 10_000)) {
    throw new Error("정산 BPS는 0~10000 사이 정수여야 합니다");
  }
  if (config.theaterBps + config.distributorBps !== 10_000) {
    throw new Error("theaterBps + distributorBps는 10000이어야 합니다");
  }
}

export class AnchorChainGateway implements ChainGateway, HistoryProvider {
  private readonly connection: web3.Connection;
  private readonly provider: AnchorProvider;
  private readonly programId: web3.PublicKey;
  private readonly program: Program;
  private readonly config: AnchorGatewayConfig;
  private readonly log: Logger;

  constructor(
    config: AnchorGatewayConfig,
    log: Logger = logger.child({ component: "AnchorChainGateway" }),
  ) {
    validateBps(config);
    const commitment = config.commitment ?? "confirmed";
    this.config = config;
    this.connection = new web3.Connection(config.rpcUrl, commitment);
    this.programId = new web3.PublicKey(config.programId);
    const keypair = loadKeypairFile(config.keypairPath);
    this.provider = new AnchorProvider(this.connection, new Wallet(keypair), {
      commitment,
    });

    const parsed = JSON.parse(readFileSync(config.idlPath, "utf8")) as Idl;
    // 같은 IDL을 Localnet·Devnet에 배포할 수 있으므로 실행 환경의 Program ID를 쓴다.
    const idl = { ...parsed, address: this.programId.toBase58() } as Idl;
    this.program = new Program(idl, this.provider);
    this.log = log;
    this.log.info("anchor gateway configured", {
      rpcUrl: config.rpcUrl,
      programId: this.programId.toBase58(),
      authority: keypair.publicKey.toBase58(),
      movieId: config.movieId,
      theater: config.theaterWallet,
      commitment,
    });
  }

  get authority(): string {
    return this.provider.wallet.publicKey.toBase58();
  }

  get theater(): string {
    return this.config.theaterWallet;
  }

  get historyProvider(): HistoryProvider {
    return this;
  }

  /** Localnet/Devnet 준비 시 계정 주소를 CLI·Explorer와 대조한다. */
  get addresses(): {
    escrow: string;
    allocations: Record<Role, string>;
  } {
    return {
      escrow: this.escrowPda().toBase58(),
      allocations: {
        theater: this.allocationPda("theater").toBase58(),
        distributor: this.allocationPda("distributor").toBase58(),
        producer: this.allocationPda("producer").toBase58(),
        investor: this.allocationPda("investor").toBase58(),
      },
    };
  }

  private get accounts(): Record<string, AccountClientLike> {
    return this.program.account as unknown as Record<string, AccountClientLike>;
  }

  private method(name: string, ...args: unknown[]): MethodBuilderLike {
    const methods = this.program.methods as unknown as Record<
      string,
      (...values: unknown[]) => MethodBuilderLike
    >;
    const factory = methods[name];
    if (!factory) throw new Error(`IDL instruction not found: ${name}`);
    return factory(...args);
  }

  private escrowPda(): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(this.config.movieId)],
      this.programId,
    )[0];
  }

  private allocationPda(role: Role): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("allocation"),
        Buffer.from(this.config.movieId),
        Buffer.from([ROLE_INDEX[role]]),
      ],
      this.programId,
    )[0];
  }

  private wallets(): Record<Role, web3.PublicKey> {
    return {
      theater: new web3.PublicKey(this.config.theaterWallet),
      distributor: new web3.PublicKey(this.config.distributorWallet),
      producer: new web3.PublicKey(this.config.producerWallet),
      investor: new web3.PublicKey(this.config.investorWallet),
    };
  }

  async preflight(): Promise<{
    rpcVersion: string;
    programDeployed: boolean;
    escrowInitialized: boolean;
    authorityBalanceLamports: number;
  }> {
    const [version, programAccount, escrowAccount, balance] = await Promise.all(
      [
        this.connection.getVersion(),
        this.connection.getAccountInfo(this.programId),
        this.connection.getAccountInfo(this.escrowPda()),
        this.connection.getBalance(this.provider.wallet.publicKey),
      ],
    );
    return {
      rpcVersion: version["solana-core"],
      programDeployed: programAccount?.executable === true,
      escrowInitialized: escrowAccount !== null,
      authorityBalanceLamports: balance,
    };
  }

  private async fetchEscrow(): Promise<MovieEscrowAccount> {
    const account = await this.accounts.movieEscrow?.fetchNullable(
      this.escrowPda(),
    );
    if (!account) {
      throw new Error(
        `MovieEscrow가 초기화되지 않았습니다 (movieId=${this.config.movieId})`,
      );
    }
    return account as MovieEscrowAccount;
  }

  private async ensureVerified(screeningId: string): Promise<string[]> {
    const escrow = await this.fetchEscrow();
    if (!("pending" in escrow.state)) return [];
    const signature = await this.method("verifyEscrow")
      .accountsStrict({
        authority: this.provider.wallet.publicKey,
        escrow: this.escrowPda(),
      })
      .rpc();
    this.log.info("escrow verified", { screeningId, signature });
    return [signature];
  }

  private async allocationClaimable(role: Role): Promise<number> {
    const account = await this.accounts.allocation?.fetchNullable(
      this.allocationPda(role),
    );
    return account ? asSafeNumber((account as AllocationAccount).claimable) : 0;
  }

  private async settle(screeningId: string, amount: number): Promise<string[]> {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error("정산 금액은 안전한 양의 정수여야 합니다");
    }
    const wallets = this.wallets();
    const verifySignatures = await this.ensureVerified(screeningId);
    const signature = await this.method(
      "settleBatch",
      screeningId,
      new BN(amount),
      this.config.theaterBps,
      this.config.distributorBps,
      this.config.distributionFeeBps,
      this.config.investorProfitBps,
    )
      .accountsStrict({
        authority: this.provider.wallet.publicKey,
        escrow: this.escrowPda(),
        theaterAllocation: this.allocationPda("theater"),
        theaterWallet: wallets.theater,
        distributorAllocation: this.allocationPda("distributor"),
        distributorWallet: wallets.distributor,
        producerAllocation: this.allocationPda("producer"),
        producerWallet: wallets.producer,
        investorAllocation: this.allocationPda("investor"),
        investorWallet: wallets.investor,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();
    this.log.info("screening settled", { screeningId, amount, signature });
    return [...verifySignatures, signature];
  }

  async settleBatch(
    screeningId: string,
    amount: number,
  ): Promise<SettleBatchResult> {
    try {
      const txSignatures = await this.settle(screeningId, amount);
      return {
        txSignature: txSignatures.at(-1) as string,
        txSignatures,
      };
    } catch (error) {
      throw toChainCallError(error, "settle_batch", screeningId);
    }
  }

  /** #33 결정: 먼저 settle한 뒤 이번 회차에 증가한 권리자별 몫을 모두 보류한다. */
  async markDisputed(
    screeningId: string,
    amount: number,
  ): Promise<SettleBatchResult> {
    try {
      const roles = Object.keys(ROLE_INDEX) as Role[];
      const before = Object.fromEntries(
        await Promise.all(
          roles.map(async (role) => [
            role,
            await this.allocationClaimable(role),
          ]),
        ),
      ) as Record<Role, number>;
      const txSignatures = await this.settle(screeningId, amount);

      for (const role of roles) {
        const delta = (await this.allocationClaimable(role)) - before[role];
        if (delta <= 0) continue;
        const signature = await this.method("markDisputed", new BN(delta))
          .accountsStrict({
            authority: this.provider.wallet.publicKey,
            escrow: this.escrowPda(),
            allocation: this.allocationPda(role),
          })
          .rpc();
        txSignatures.push(signature);
        this.log.info("allocation disputed", {
          screeningId,
          role,
          amount: delta,
          signature,
        });
      }

      return {
        txSignature: txSignatures.at(-1) as string,
        txSignatures,
      };
    } catch (error) {
      throw toChainCallError(error, "mark_disputed", screeningId);
    }
  }

  async fetchTheaterHistory(theater: string): Promise<OnchainHistorySummary> {
    const theaterKey = new web3.PublicKey(theater);
    // movie_id가 가변 길이 String이라 theater의 byte offset이 고정되지 않는다.
    // 데모 규모에서는 전체 MovieEscrow를 디코딩한 뒤 공개키로 필터링한다.
    const all = (await this.accounts.movieEscrow?.all()) ?? [];
    const matches = all
      .map(({ account }) => account as MovieEscrowAccount)
      .filter((account) => account.theater.equals(theaterKey));
    const settledBatchCount = matches.reduce(
      (sum, account) => sum + account.batchCount,
      0,
    );
    const disputeCount = matches.reduce(
      (sum, account) => sum + account.disputeCount,
      0,
    );
    const totalSettledAmount = matches.reduce(
      (sum, account) =>
        sum +
        asSafeNumber(account.allocated) +
        asSafeNumber(account.disputed) +
        asSafeNumber(account.paidOut),
      0,
    );
    return {
      theater,
      settledBatchCount,
      totalSettledAmount,
      anomalyCount: disputeCount,
      disputeCount,
      isNew: settledBatchCount === 0,
    };
  }
}
