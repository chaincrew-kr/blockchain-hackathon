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

export class AgentStore {
  private batchResult: BatchRunResult | null = null;

  constructor(private readonly screenings: readonly ScreeningBatchInput[]) {}

  get batch(): readonly ScreeningBatchInput[] {
    return this.screenings;
  }

  recordBatchRun(result: BatchRunResult): void {
    this.batchResult = result;
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
