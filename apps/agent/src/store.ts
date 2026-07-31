/**
 * 에이전트 인메모리 상태 — 대시보드(A)가 읽는 DashboardSnapshot의 원본.
 *
 * Phase 1 데모 범위에서는 서버 메모리로 충분하다.
 * TODO(D, 시간 되면): 판단 로그 Firestore 적재 (새로고침 복구 — 7/31 점검 항목)
 */
import type { DashboardSnapshot, TicketEvent } from "@chaincrew/schema";

import type { BatchRunResult, ScreeningBatchInput } from "./pipeline.js";
import { netAmountOf } from "./pipeline.js";

function sumRefunded(events: TicketEvent[]): number {
  return events
    .filter((e) => e.kind === "refund")
    .reduce((sum, e) => sum + e.amount, 0);
}

/** 배치 실행 상태 — 이중 정산을 막는 근거가 되는 값이다. */
export type BatchRunState = "idle" | "running" | "completed";

export class AgentStore {
  private batchResult: BatchRunResult | null = null;
  private state: BatchRunState = "idle";

  constructor(private readonly screenings: readonly ScreeningBatchInput[]) {}

  get batch(): readonly ScreeningBatchInput[] {
    return this.screenings;
  }

  get runState(): BatchRunState {
    return this.state;
  }

  /**
   * 실행 슬롯을 점유한다. 이미 실행 중이면 false.
   *
   * ⚠️ 반드시 **첫 await 이전에 동기적으로** 호출할 것. Node는 단일 스레드라
   *    await 사이에만 다른 요청이 끼어들 수 있으므로, 검사와 점유가 같은 tick에
   *    끝나야 두 요청이 동시에 통과하지 않는다.
   */
  tryBeginRun(): boolean {
    if (this.state === "running") return false;
    this.state = "running";
    return true;
  }

  /** 실행 실패 — 결과가 없으면 idle로 되돌려 재시도를 허용한다. */
  abortRun(): void {
    this.state = this.batchResult ? "completed" : "idle";
  }

  recordBatchRun(result: BatchRunResult): void {
    this.batchResult = result;
    this.state = "completed";
  }

  /** 리허설용 초기화 — 배치 트리거 이전 상태로 되돌린다. */
  reset(): void {
    this.batchResult = null;
    this.state = "idle";
  }

  get lastBatchRun(): BatchRunResult | null {
    return this.batchResult;
  }

  /** 현재 상태를 DashboardSnapshot으로 스냅샷 — 불변식: gross = pending+allocated+disputed+paid+refunded */
  snapshot(): DashboardSnapshot {
    const allEvents = this.screenings.flatMap((s) => s.events);
    const refunded = sumRefunded(allEvents);
    const grossIn = this.screenings.reduce(
      (sum, s) => sum + netAmountOf(s.events),
      refunded,
    );

    if (!this.batchResult) {
      // 배치 트리거 전 — 전액 Pending (격리 불변식 ③)
      return {
        // TODO(D): ChainGateway 연결 후 실제 escrow 계정값으로 대체 (B, 2026-07-30)
        movieId: "",
        contractHash: "",
        status: "pending",
        grossIn,
        pending: grossIn - refunded,
        allocated: 0,
        disputed: 0,
        paidOut: 0,
        refunded,
        balances: [], // TODO(B): settle_batch 워터폴 결과로 채움 (STAGE 2)
        timeline: [],
        decisions: [],
      };
    }

    const outcomes = this.batchResult.outcomes;
    const allocated = outcomes
      .filter((o) => o.decision.verdict === "proceed")
      .reduce((sum, o) => sum + o.netAmount, 0);
    const disputed = outcomes.reduce(
      (sum, o) => sum + o.decision.heldAmount,
      0,
    );

    return {
      // TODO(D): ChainGateway 연결 후 실제 escrow 계정값으로 대체 (B, 2026-07-30)
      movieId: "",
      contractHash: "",
      status: disputed > 0 ? "disputed" : "allocated",
      grossIn,
      pending: grossIn - refunded - allocated - disputed,
      allocated,
      disputed,
      paidOut: 0, // STAGE 5(C, claim/분배) 연결 후 반영
      refunded,
      balances: [], // TODO(B): 워터폴(수수료→MG→상환→배분) 산출 후 권리자별 몫
      timeline: this.batchResult.timeline,
      decisions: outcomes.map((o) => o.decision),
    };
  }
}
