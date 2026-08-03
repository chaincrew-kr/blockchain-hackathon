/**
 * 체인 호출 게이트웨이 — movie_escrow instruction 어댑터.
 *
 * 온체인 정산 흐름(B·C 구현 기준, 7/31 IDL):
 *   mark_disputed(보류 회차별 격리) → verify_escrow(Pending→Verified 게이트)
 *   → settle_batch(잔여 pending 전액 워터폴)
 *
 * settle_batch는 회차 단위가 아니라 escrow.pending 전체를 한 번에 나누므로
 * 금액 인자가 없고 부율(bps)만 받는다 — 정산 금액은 온체인 상태가 결정한다.
 */

export interface SettleBatchResult {
  txSignature: string;
}

/**
 * settle_batch 워터폴 인자 — 승인된 SettlementRule vN에서 파생돼야 한다.
 * theaterBps + distributorBps = 10000이 아니면 온체인이 InvalidWaterfallParams로
 * 거부한다.
 */
export interface SettleWaterfallParams {
  /** 에스크로 PDA 시드 (state.rs의 movie_id) */
  movieId: string;
  /** 극장 부율 (basis point) */
  theaterBps: number;
  /** 배급 부율 (basis point) */
  distributorBps: number;
  /** 배급수수료율 — 배급 몫 대비 (basis point) */
  distributionFeeBps: number;
}

export interface ChainGateway {
  /** verify_escrow — STAGE 3 검증 통과를 온체인에 기록 (Pending → Verified) */
  verifyEscrow(movieId: string): Promise<SettleBatchResult>;
  /** settle_batch — Verified 상태의 pending 전액을 워터폴로 귀속 확정 */
  settleBatch(params: SettleWaterfallParams): Promise<SettleBatchResult>;
  /** mark_disputed — 보류 판정 금액을 Disputed로 격리 */
  markDisputed(
    movieId: string,
    screeningId: string,
    amount: number,
  ): Promise<SettleBatchResult>;
}

export type StubChainCall =
  | { instruction: "verify_escrow"; movieId: string }
  | {
      instruction: "settle_batch";
      movieId: string;
      theaterBps: number;
      distributorBps: number;
      distributionFeeBps: number;
    }
  | {
      instruction: "mark_disputed";
      movieId: string;
      screeningId: string;
      amount: number;
    };

/** 체인 미연결 개발·데모용 — 가짜 tx 서명을 돌려준다. */
export class StubChainGateway implements ChainGateway {
  readonly calls: StubChainCall[] = [];

  async verifyEscrow(movieId: string): Promise<SettleBatchResult> {
    this.calls.push({ instruction: "verify_escrow", movieId });
    return { txSignature: `STUB_VERIFY_${movieId}` };
  }

  async settleBatch(params: SettleWaterfallParams): Promise<SettleBatchResult> {
    this.calls.push({ instruction: "settle_batch", ...params });
    return { txSignature: `STUB_SETTLE_${params.movieId}` };
  }

  async markDisputed(
    movieId: string,
    screeningId: string,
    amount: number,
  ): Promise<SettleBatchResult> {
    this.calls.push({
      instruction: "mark_disputed",
      movieId,
      screeningId,
      amount,
    });
    return { txSignature: `STUB_DISPUTE_${screeningId}` };
  }
}
