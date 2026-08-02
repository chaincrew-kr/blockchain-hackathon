/**
 * 배치 트리거(P7) → STAGE 3 → STAGE 4 → 체인 호출 오케스트레이션.
 *
 * 흐름(실행계획서 §1):
 *   이력 조회 → 임계값 조정 → 데모 정합성 검증 3종 → (Phase 2 훅, 지금은 no-op)
 *   → 판정 → 진행이면 settle_batch(B), 보류면 mark_disputed(C)
 */
import type {
  JudgeDecision,
  ScreeningMeta,
  TicketEvent,
  TimelineEntry,
  VerificationResult,
} from "@chaincrew/schema";
import type { NarrativeGenerator } from "@chaincrew/ai-data";

import { ChainCallError } from "./errors.js";
import { judgeSettlement } from "./judge/index.js";
import {
  adjustThresholds,
  checkRefundEvidence,
  checkTrustFreshness,
  fetchTheaterHistory,
  verifyIntegrity,
} from "./risk-check/index.js";
import type { HistoryProvider } from "./risk-check/history.js";
import type { ChainGateway } from "./chain/gateway.js";

export interface ScreeningBatchInput {
  meta: ScreeningMeta;
  events: TicketEvent[];
}

export interface ScreeningOutcome {
  verification: VerificationResult;
  decision: JudgeDecision;
  /** 발권 − 환불 (USDC 최소단위) */
  netAmount: number;
  txSignature: string;
}

export interface BatchRunResult {
  theater: string;
  outcomes: ScreeningOutcome[];
  timeline: TimelineEntry[];
}

export interface PipelineDeps {
  historyProvider?: HistoryProvider;
  chainGateway: ChainGateway;
  narrativeGenerator?: NarrativeGenerator;
}

/**
 * 체인 호출 — 실패를 ChainCallError(502)로 분류한다.
 *
 * 우리 판정 로직의 버그(500)와 업스트림 체인 장애(502)를 섞으면 대시보드가
 * 재시도해도 되는 상황인지 판단할 수 없다.
 */
async function callChain(
  gateway: ChainGateway,
  decision: JudgeDecision,
  screeningId: string,
  netAmount: number,
): Promise<string> {
  const proceed = decision.verdict === "proceed";
  const instruction = proceed ? "settle_batch" : "mark_disputed";
  try {
    const { txSignature } = proceed
      ? await gateway.settleBatch(screeningId, netAmount)
      : await gateway.markDisputed(screeningId, decision.heldAmount);
    return txSignature;
  } catch (error) {
    throw new ChainCallError(
      `${instruction} failed for ${screeningId}`,
      instruction,
      {
        cause: error,
      },
    );
  }
}

/** 발권 합계 − 환불 합계 */
export function netAmountOf(events: TicketEvent[]): number {
  return events.reduce(
    (sum, e) => (e.kind === "issue" ? sum + e.amount : sum - e.amount),
    0,
  );
}

export async function runSettlementBatch(
  theater: string,
  screenings: readonly ScreeningBatchInput[],
  deps: PipelineDeps,
): Promise<BatchRunResult> {
  const history = await fetchTheaterHistory(theater, deps.historyProvider);

  // Phase 2 훅 — Phase 1에서는 항상 { needed: false } (실행계획서 §2 협업 규칙 5)
  await checkTrustFreshness(history);

  const outcomes: ScreeningOutcome[] = [];
  const timeline: TimelineEntry[] = [];

  for (const { meta, events } of screenings) {
    const thresholds = adjustThresholds(history, meta);
    const verification = verifyIntegrity(events, thresholds, meta);
    await checkRefundEvidence(verification);

    const netAmount = netAmountOf(events);
    const decision = await judgeSettlement(
      verification,
      meta,
      netAmount,
      deps.narrativeGenerator,
    );

    const txSignature = await callChain(
      deps.chainGateway,
      decision,
      meta.screeningId,
      netAmount,
    );

    timeline.push({
      label:
        decision.verdict === "proceed"
          ? `settle_batch — ${meta.screeningId}`
          : `mark_disputed — ${meta.screeningId}`,
      txSignature,
      timestamp: decision.decidedAt,
    });
    outcomes.push({ verification, decision, netAmount, txSignature });
  }

  return { theater, outcomes, timeline };
}
