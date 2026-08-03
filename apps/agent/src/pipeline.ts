/**
 * 배치 트리거(P7) → STAGE 3 → STAGE 4 → 체인 호출 오케스트레이션.
 *
 * 흐름(실행계획서 §1 + 온체인 상태머신):
 *   이력 조회 → 임계값 조정 → 정합성 검증 4종 → (Phase 2 훅, 지금은 no-op)
 *   → 회차별 판정 → 보류 회차는 mark_disputed(C)로 즉시 격리
 *   → 잔여분이 있으면 verify_escrow → settle_batch(B) 일괄 워터폴
 *
 * 호출 순서가 온체인 제약이다: settle_batch는 escrow.pending 전액을 소비하므로
 * 보류 격리가 반드시 먼저 끝나야 하고, verify_escrow(Pending→Verified)가
 * settle_batch의 상태 게이트를 연다.
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
import { demoSettlement } from "./fixtures/screenings.js";
import { judgeSettlement } from "./judge/index.js";
import {
  adjustThresholds,
  checkRefundEvidence,
  checkTrustFreshness,
  fetchTheaterHistory,
  verifyIntegrity,
} from "./risk-check/index.js";
import type { HistoryProvider } from "./risk-check/history.js";
import type { ChainGateway, SettleWaterfallParams } from "./chain/gateway.js";

export interface ScreeningBatchInput {
  meta: ScreeningMeta;
  events: TicketEvent[];
}

export interface ScreeningOutcome {
  verification: VerificationResult;
  decision: JudgeDecision;
  /** 발권 − 환불 (USDC 최소단위) */
  netAmount: number;
  /** 보류 회차는 자기 mark_disputed tx, 진행 회차는 공동 settle_batch tx */
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
  /**
   * 워터폴 인자 — 미지정 시 데모 픽스처를 쓴다.
   * 실데이터 연결 시 승인된 SettlementRule에서 파생해 주입한다.
   */
  settlement?: SettleWaterfallParams;
}

/**
 * 체인 호출 — 실패를 ChainCallError(502)로 분류한다.
 *
 * 우리 판정 로직의 버그(500)와 업스트림 체인 장애(502)를 섞으면 대시보드가
 * 재시도해도 되는 상황인지 판단할 수 없다.
 */
async function callChain(
  instruction: string,
  contextId: string,
  call: () => Promise<{ txSignature: string }>,
): Promise<string> {
  try {
    const { txSignature } = await call();
    return txSignature;
  } catch (error) {
    // AnchorChainGateway는 이미 분류된 ChainCallError를 던진다 — 이중 포장 방지.
    if (error instanceof ChainCallError) throw error;
    throw new ChainCallError(
      `${instruction} failed for ${contextId}`,
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
  const settlement = deps.settlement ?? demoSettlement;
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

    // 보류분은 settle_batch 전에 격리해야 pending에서 빠진다.
    let txSignature = "";
    if (decision.verdict === "partial-hold") {
      txSignature = await callChain("mark_disputed", meta.screeningId, () =>
        deps.chainGateway.markDisputed(
          settlement.movieId,
          meta.screeningId,
          decision.heldAmount,
        ),
      );
      timeline.push({
        label: `mark_disputed — ${meta.screeningId}`,
        txSignature,
        timestamp: decision.decidedAt,
      });
    }

    outcomes.push({ verification, decision, netAmount, txSignature });
  }

  // 잔여분(전체 − 보류)이 있을 때만 검증 기록 + 일괄 정산.
  // 전액 보류면 settle_batch가 온체인에서 gross=0으로 거부되므로 건너뛴다.
  const settleAmount = outcomes.reduce(
    (sum, o) => sum + o.netAmount - o.decision.heldAmount,
    0,
  );
  if (settleAmount > 0) {
    const verifyTx = await callChain("verify_escrow", settlement.movieId, () =>
      deps.chainGateway.verifyEscrow(settlement.movieId),
    );
    timeline.push({
      label: `verify_escrow — ${settlement.movieId}`,
      txSignature: verifyTx,
      timestamp: Date.now(),
    });

    const settleTx = await callChain("settle_batch", settlement.movieId, () =>
      deps.chainGateway.settleBatch(settlement),
    );
    timeline.push({
      label: `settle_batch — ${settlement.movieId}`,
      txSignature: settleTx,
      timestamp: Date.now(),
    });

    for (const outcome of outcomes) {
      if (outcome.decision.verdict === "proceed")
        outcome.txSignature = settleTx;
    }
  }

  return { theater, outcomes, timeline };
}
