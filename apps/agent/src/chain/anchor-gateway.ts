/**
 * 실제 온체인 호출 게이트웨이 — B·C의 movie_escrow 프로그램 어댑터.
 *
 * **현재 상태: 연결 계층만 완성돼 있고 instruction 호출부가 비어 있다.**
 *
 * IDL(`packages/schema/idl/movie_escrow.json`)이 아직 없어서 `Program` 객체를
 * 만들 수 없다. IDL이 커밋되는 즉시 아래 `callInstruction`의 TODO 한 곳만
 * 채우면 동작한다 — RPC 연결·지갑·에러 매핑·재시도는 이미 준비돼 있다.
 *
 * 연결 순서(IDL 도착 시):
 *   1. B·C가 `anchor build` 후 IDL을 packages/schema/idl로 복사 (이슈 #17)
 *   2. 이 파일의 `loadProgram()` 주석 해제
 *   3. `callInstruction()`의 TODO를 실제 methods 호출로 교체
 *   4. .env에 SOLANA_PROGRAM_ID·AGENT_KEYPAIR_PATH 설정
 *
 * 시그니처가 확정되지 않은 상태라(이슈 #6) 미리 짜 두면 틀릴 수 있으므로,
 * 확정된 부분만 구현하고 호출부는 명시적으로 비워 뒀다.
 */
import { AnchorProvider, AnchorError, web3, Wallet } from "@coral-xyz/anchor";

import { ChainCallError } from "../errors.js";
import { logger, type Logger } from "../logger.js";
import type { ChainGateway, SettleBatchResult } from "./gateway.js";
import { loadKeypairFile } from "./keypair.js";

export interface AnchorGatewayConfig {
  rpcUrl: string;
  programId: string;
  /** Solana CLI JSON 키파일 경로 — MovieEscrow.authority로 서명한다 */
  keypairPath: string;
  /** 트랜잭션 확정 수준. 데모는 confirmed로 충분하다 */
  commitment?: web3.Commitment;
}

type Instruction = "settle_batch" | "mark_disputed";

/**
 * 온체인 오류 → 사람이 읽을 수 있는 설명.
 * `programs/movie_escrow/src/error.rs`의 EscrowError와 대응한다.
 */
const ESCROW_ERROR_HINTS: Record<string, string> = {
  NotImplemented:
    "프로그램이 아직 스텁입니다 — B·C의 instruction 구현 대기 (이슈 #17)",
  ExceedsClaimable: "인출 요청이 Claimable 잔액을 초과했습니다",
  InvalidState: "현재 에스크로 상태에서는 실행할 수 없는 instruction입니다",
  MathOverflow: "정산 계산에서 정수 오버플로가 발생했습니다",
  RuleHashMismatch: "승인된 정산 규칙 해시와 일치하지 않습니다",
};

/**
 * IDL 미도착 — 우리가 만든 진단용 예외.
 *
 * 업스트림 예외 메시지는 응답에 싣지 않지만(스택·내부 경로 유출), 이건 우리가
 * 쓴 문장이라 노출해도 안전하고 **노출해야 한다.** "그냥 실패했습니다"만 보이면
 * 운영자가 B·C 대기 중인지 RPC 장애인지 구분할 수 없다.
 */
class IdlUnavailableError extends Error {
  constructor() {
    super("movie_escrow IDL not found");
    this.name = "IdlUnavailableError";
  }
}

/** Anchor 예외를 ChainCallError(502)로 정규화 — 원인은 로그로만 남긴다. */
function toChainCallError(
  error: unknown,
  instruction: Instruction,
  screeningId: string,
): ChainCallError {
  let detail = "체인 호출이 실패했습니다";

  if (error instanceof IdlUnavailableError) {
    detail =
      "movie_escrow IDL 미도착 — B·C의 anchor build 산출물을 " +
      "packages/schema/idl에 커밋해야 합니다 (이슈 #17)";
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
    `${instruction} failed for ${screeningId}: ${detail}`,
    instruction,
    { cause: error },
  );
}

export class AnchorChainGateway implements ChainGateway {
  private readonly connection: web3.Connection;
  private readonly provider: AnchorProvider;
  private readonly programId: web3.PublicKey;
  private readonly log: Logger;

  constructor(
    config: AnchorGatewayConfig,
    log: Logger = logger.child({ component: "AnchorChainGateway" }),
  ) {
    const commitment = config.commitment ?? "confirmed";

    this.connection = new web3.Connection(config.rpcUrl, commitment);
    this.programId = new web3.PublicKey(config.programId);

    const keypair = loadKeypairFile(config.keypairPath);
    this.provider = new AnchorProvider(this.connection, new Wallet(keypair), {
      commitment,
    });

    this.log = log;
    // 공개키는 로그에 남겨도 안전하다 — Explorer에서 authority 확인용.
    this.log.info("anchor gateway configured", {
      rpcUrl: config.rpcUrl,
      programId: this.programId.toBase58(),
      authority: keypair.publicKey.toBase58(),
      commitment,
    });
  }

  /** 에이전트 서명 지갑의 공개키 — Explorer 대조·잔액 확인용 */
  get authority(): string {
    return this.provider.wallet.publicKey.toBase58();
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

  async settleBatch(
    screeningId: string,
    amount: number,
  ): Promise<SettleBatchResult> {
    return this.callInstruction("settle_batch", screeningId, amount);
  }

  async markDisputed(
    screeningId: string,
    amount: number,
  ): Promise<SettleBatchResult> {
    return this.callInstruction("mark_disputed", screeningId, amount);
  }

  /**
   * ⛔ 여기가 IDL 대기 중인 유일한 지점이다.
   *
   * IDL이 들어오면 이 메서드 안을 아래처럼 채운다. 나머지(연결·지갑·에러
   * 매핑·로깅)는 이미 완성돼 있으므로 손댈 필요가 없다.
   *
   * ```ts
   * const program = new Program(idl, this.programId, this.provider);
   * const signature =
   *   instruction === "settle_batch"
   *     ? await program.methods.settleBatch(...).accounts({...}).rpc()
   *     : await program.methods.markDisputed(new BN(amount)).accounts({...}).rpc();
   * return { txSignature: signature };
   * ```
   *
   * 계정 목록과 인자는 이슈 #6에서 B·C가 확정한 뒤에 채운다 — 지금 추측해서
   * 쓰면 틀린 코드를 리뷰하게 된다.
   */
  private async callInstruction(
    instruction: Instruction,
    screeningId: string,
    amount: number,
  ): Promise<SettleBatchResult> {
    this.log.warn("chain call attempted before IDL is available", {
      instruction,
      screeningId,
      amount,
    });

    try {
      // TODO(D, IDL 커밋 후): Program 생성 + methods 호출로 교체 (이슈 #6·#17)
      throw new IdlUnavailableError();
    } catch (error) {
      throw toChainCallError(error, instruction, screeningId);
    }
  }
}
