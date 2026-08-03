/**
 * 실제 온체인 호출 게이트웨이 — B·C의 movie_escrow 프로그램 어댑터.
 *
 * IDL(`@chaincrew/schema/idl/movie_escrow.json`, 7/31 커밋)을 로드해 Program을
 * 구성하고 escrow·allocation PDA를 역산해 트랜잭션을 전송한다. env의
 * SOLANA_PROGRAM_ID가 IDL의 address보다 우선한다 — 로컬넷·데브넷 재배포 시
 * IDL 재생성을 기다리지 않기 위해서다.
 *
 * ⚠️ mark_disputed는 아직 dev의 스텁 시그니처(authority + amount)다.
 *    C의 feature/claim이 머지되어 IDL이 재생성되면 계정 목록을 갱신할 것.
 */
import { createRequire } from "node:module";

import {
  AnchorError,
  AnchorProvider,
  BN,
  Program,
  Wallet,
  web3,
  type Idl,
} from "@coral-xyz/anchor";

import { ChainCallError } from "../errors.js";
import { logger, type Logger } from "../logger.js";
import type {
  ChainGateway,
  SettleBatchResult,
  SettleWaterfallParams,
} from "./gateway.js";
import { loadKeypairFile } from "./keypair.js";

const requireModule = createRequire(import.meta.url);

/** state.rs BeneficiaryRole의 discriminant — Allocation PDA 시드 3번째 요소. */
const ROLE_THEATER = 0;
const ROLE_DISTRIBUTOR = 1;
const ROLE_PRODUCER = 2;

/** settle_batch가 Allocation에 기록할 권리자 지갑 (base58) */
export interface BeneficiaryWallets {
  theater: string;
  distributor: string;
  producer: string;
}

export interface AnchorGatewayConfig {
  rpcUrl: string;
  programId: string;
  /** Solana CLI JSON 키파일 경로 — MovieEscrow.authority로 서명한다 */
  keypairPath: string;
  /**
   * 없으면 verify_escrow·mark_disputed만 가능하고 settle_batch는 명확한
   * 오류로 거부된다 — 지갑 없이 조용히 잘못된 계정에 기록하는 것보다 낫다.
   */
  beneficiaryWallets?: BeneficiaryWallets | undefined;
  /** 트랜잭션 확정 수준. 데모는 confirmed로 충분하다 */
  commitment?: web3.Commitment;
}

type Instruction = "verify_escrow" | "settle_batch" | "mark_disputed";

/**
 * 온체인 오류 → 사람이 읽을 수 있는 설명.
 * `programs/movie_escrow/src/error.rs`의 EscrowError와 대응한다.
 */
const ESCROW_ERROR_HINTS: Record<string, string> = {
  NotImplemented:
    "프로그램이 아직 스텁입니다 — C의 mark_disputed·claim은 feature/claim 머지 대기",
  ExceedsClaimable: "인출 요청이 Claimable 잔액을 초과했습니다",
  InvalidState:
    "현재 에스크로 상태에서는 실행할 수 없는 instruction입니다 " +
    "(settle_batch는 Verified, verify_escrow는 Pending 상태여야 합니다)",
  MathOverflow: "정산 계산에서 정수 오버플로가 발생했습니다",
  RuleHashMismatch: "승인된 정산 규칙 해시와 일치하지 않습니다",
  InvalidWaterfallParams:
    "부율 인자가 잘못됐습니다 — theaterBps + distributorBps = 10000이어야 합니다",
};

/**
 * IDL 로드 실패 — 우리가 만든 진단용 예외.
 *
 * 업스트림 예외 메시지는 응답에 싣지 않지만(스택·내부 경로 유출), 이건 우리가
 * 쓴 문장이라 노출해도 안전하고 **노출해야 한다.** "그냥 실패했습니다"만 보이면
 * 운영자가 IDL 문제인지 RPC 장애인지 구분할 수 없다.
 */
class IdlUnavailableError extends Error {
  constructor() {
    super("movie_escrow IDL unavailable");
    this.name = "IdlUnavailableError";
  }
}

/** Anchor 예외를 ChainCallError(502)로 정규화 — 원인은 로그로만 남긴다. */
function toChainCallError(
  error: unknown,
  instruction: Instruction,
  contextId: string,
): ChainCallError {
  let detail = "체인 호출이 실패했습니다";

  if (error instanceof IdlUnavailableError) {
    detail =
      "movie_escrow IDL 로드 실패 — @chaincrew/schema/idl/movie_escrow.json과 " +
      "schema package.json의 exports를 확인하세요";
  } else if (error instanceof AnchorError) {
    const code = error.error.errorCode.code;
    const hint = ESCROW_ERROR_HINTS[code];
    detail = hint
      ? `${code} — ${hint}`
      : `${code} (${error.error.errorMessage})`;
  } else if (error instanceof web3.SendTransactionError) {
    detail = "트랜잭션 전송이 거부되었습니다 (RPC 또는 시뮬레이션 실패)";
  }

  return new ChainCallError(
    `${instruction} failed for ${contextId}: ${detail}`,
    instruction,
    { cause: error },
  );
}

/**
 * anchor의 제네릭 `Idl` 타입으로는 메서드 이름이 잡히지 않는다 — 생성된
 * movie_escrow.ts 타입을 연결하기 전까지의 수동 시그니처. IDL과 어긋나면
 * 런타임에 즉시 실패하므로 시그니처 변경 시 여기도 함께 갱신할 것.
 */
interface MethodsBuilder {
  accounts(accounts: Record<string, web3.PublicKey>): {
    rpc(): Promise<string>;
  };
}

interface MovieEscrowMethods {
  verifyEscrow(): MethodsBuilder;
  settleBatch(
    theaterBps: number,
    distributorBps: number,
    distributionFeeBps: number,
  ): MethodsBuilder;
  markDisputed(amount: BN): MethodsBuilder;
}

function loadIdl(log: Logger): Idl | null {
  try {
    return requireModule("@chaincrew/schema/idl/movie_escrow.json") as Idl;
  } catch (error) {
    log.error("movie_escrow IDL load failed", error);
    return null;
  }
}

export class AnchorChainGateway implements ChainGateway {
  private readonly connection: web3.Connection;
  private readonly provider: AnchorProvider;
  private readonly programId: web3.PublicKey;
  private readonly program: Program | null;
  private readonly beneficiaryWallets: BeneficiaryWallets | undefined;
  private readonly log: Logger;

  constructor(
    config: AnchorGatewayConfig,
    log: Logger = logger.child({ component: "AnchorChainGateway" }),
  ) {
    const commitment = config.commitment ?? "confirmed";

    this.connection = new web3.Connection(config.rpcUrl, commitment);
    this.programId = new web3.PublicKey(config.programId);
    this.beneficiaryWallets = config.beneficiaryWallets;

    const keypair = loadKeypairFile(config.keypairPath);
    this.provider = new AnchorProvider(this.connection, new Wallet(keypair), {
      commitment,
    });

    this.log = log;

    const idl = loadIdl(this.log);
    let program: Program | null = null;
    if (idl) {
      try {
        program = new Program(
          // env의 program id가 IDL의 address보다 우선한다.
          { ...idl, address: this.programId.toBase58() } as Idl,
          this.provider,
        );
      } catch (error) {
        // IDL 형식 비호환 등 — 서버는 살리고 호출 시점에 명확히 실패시킨다.
        this.log.error("movie_escrow Program 구성 실패 — IDL 형식 확인", error);
      }
    }
    this.program = program;

    // 공개키는 로그에 남겨도 안전하다 — Explorer에서 authority 확인용.
    this.log.info("anchor gateway configured", {
      rpcUrl: config.rpcUrl,
      programId: this.programId.toBase58(),
      authority: keypair.publicKey.toBase58(),
      commitment,
      idlLoaded: this.program !== null,
      beneficiaryWallets:
        this.beneficiaryWallets ?? "미설정 (settle_batch 불가)",
    });
  }

  /** 에이전트 서명 지갑의 공개키 — Explorer 대조·잔액 확인용 */
  get authority(): string {
    return this.provider.wallet.publicKey.toBase58();
  }

  /** IDL이 로드되어 instruction 호출이 가능한 상태인지 */
  get ready(): boolean {
    return this.program !== null;
  }

  /**
   * RPC 연결과 프로그램 배포 여부를 확인한다.
   * 서버 기동 시 한 번 불러 두면 설정 오류를 데모 도중이 아니라 미리 잡는다.
   */
  async preflight(): Promise<{
    rpcVersion: string;
    programDeployed: boolean;
    authorityBalanceLamports: number;
  }> {
    const version = await this.connection.getVersion();
    const account = await this.connection.getAccountInfo(this.programId);
    const balance = await this.connection.getBalance(
      this.provider.wallet.publicKey,
    );

    return {
      rpcVersion: version["solana-core"],
      // 프로그램 계정이 없거나 executable이 아니면 아직 배포 전이다.
      programDeployed: account?.executable === true,
      authorityBalanceLamports: balance,
    };
  }

  /** seeds = [b"escrow", movie_id] */
  private escrowPda(movieId: string): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(movieId)],
      this.programId,
    )[0];
  }

  /** seeds = [b"allocation", movie_id, role] — 역할 고정 4종이라 역산 가능 */
  private allocationPda(movieId: string, role: number): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from("allocation"), Buffer.from(movieId), Buffer.from([role])],
      this.programId,
    )[0];
  }

  async verifyEscrow(movieId: string): Promise<SettleBatchResult> {
    return this.send("verify_escrow", movieId, (methods) =>
      methods
        .verifyEscrow()
        .accounts({
          authority: this.provider.wallet.publicKey,
          escrow: this.escrowPda(movieId),
        })
        .rpc(),
    );
  }

  async settleBatch(params: SettleWaterfallParams): Promise<SettleBatchResult> {
    const wallets = this.beneficiaryWallets;
    if (!wallets) {
      throw new ChainCallError(
        "settle_batch requires beneficiary wallets — " +
          "THEATER_WALLET·DISTRIBUTOR_WALLET·PRODUCER_WALLET 환경변수를 설정하세요",
        "settle_batch",
      );
    }

    return this.send("settle_batch", params.movieId, (methods) =>
      methods
        .settleBatch(
          params.theaterBps,
          params.distributorBps,
          params.distributionFeeBps,
        )
        .accounts({
          authority: this.provider.wallet.publicKey,
          escrow: this.escrowPda(params.movieId),
          theaterAllocation: this.allocationPda(params.movieId, ROLE_THEATER),
          theaterWallet: new web3.PublicKey(wallets.theater),
          distributorAllocation: this.allocationPda(
            params.movieId,
            ROLE_DISTRIBUTOR,
          ),
          distributorWallet: new web3.PublicKey(wallets.distributor),
          producerAllocation: this.allocationPda(params.movieId, ROLE_PRODUCER),
          producerWallet: new web3.PublicKey(wallets.producer),
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc(),
    );
  }

  async markDisputed(
    movieId: string,
    screeningId: string,
    amount: number,
  ): Promise<SettleBatchResult> {
    // TODO(D, feature/claim 머지 후): escrow 계정 + 판정 근거 인자를 C의 실제
    // 시그니처에 맞게 갱신. 지금은 dev IDL의 스텁 시그니처(authority + amount).
    void movieId;
    return this.send("mark_disputed", screeningId, (methods) =>
      methods
        .markDisputed(new BN(amount))
        .accounts({ authority: this.provider.wallet.publicKey })
        .rpc(),
    );
  }

  private async send(
    instruction: Instruction,
    contextId: string,
    call: (methods: MovieEscrowMethods) => Promise<string>,
  ): Promise<SettleBatchResult> {
    try {
      if (!this.program) throw new IdlUnavailableError();
      const txSignature = await call(
        this.program.methods as unknown as MovieEscrowMethods,
      );
      this.log.info("chain call confirmed", {
        instruction,
        contextId,
        txSignature,
      });
      return { txSignature };
    } catch (error) {
      this.log.error(`chain call failed: ${instruction} (${contextId})`, error);
      throw toChainCallError(error, instruction, contextId);
    }
  }
}
