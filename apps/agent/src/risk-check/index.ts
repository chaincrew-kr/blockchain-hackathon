/**
 * STAGE 3 위험조정검증 — 온체인 이력만으로 완결 (Phase 1).
 *
 * 입력:  STAGE 1 발권·환불 로그(온체인) + 같은 상영관의 과거 정산 이력
 * 출력:  조정된 임계값 + 정합성 검증 4종(P3~P5) 결과
 */
import type {
  AdjustedThresholds,
  OnchainHistorySummary,
  Phase2HookResult,
  ScreeningMeta,
  TicketEvent,
  VerificationResult,
} from "@chaincrew/schema";

/** 기본(보수적) 임계값 — 계약서 조항 숫자와 일치시킬 것 (실행계획서 STAGE 4 결정) */
const DEFAULT_THRESHOLDS = {
  maxRefundRate: 0.1,
  maxFreeRate: 0.15,
} as const;

/** 같은 상영관의 이전 정산 배치를 온체인 RPC로 집계한다. */
export async function fetchTheaterHistory(
  theater: string,
): Promise<OnchainHistorySummary> {
  // TODO(D): getProgramAccounts로 과거 배치 기록 조회 → 집계
  return {
    theater,
    settledBatchCount: 0,
    totalSettledAmount: 0,
    anomalyCount: 0,
    disputeCount: 0,
    isNew: true,
  };
}

/** 이력 좋은 상영관은 정상 임계값, 신규는 보수적(더 엄격) 임계값. */
export function adjustThresholds(
  history: OnchainHistorySummary,
  meta: ScreeningMeta,
): AdjustedThresholds {
  // TODO(D): 조정 폭(신규 −30% 권장안) 팀 합의 후 반영
  const tighten = history.isNew ? 0.7 : 1;
  return {
    maxRefundRate: DEFAULT_THRESHOLDS.maxRefundRate * tighten,
    maxFreeRate: DEFAULT_THRESHOLDS.maxFreeRate * tighten,
    maxTicketsPerScreening: meta.seatCount,
  };
}

/** 정합성 검증 4종: 환불률(P3)·무료비율(P3)·발권초과(P4)·해시연속성(P5) */
export function verifyIntegrity(
  events: TicketEvent[],
  thresholds: AdjustedThresholds,
  meta: ScreeningMeta,
): VerificationResult {
  // TODO(D): events에서 직접 계산 — 외부 데이터 불필요
  void events;
  return {
    screeningId: meta.screeningId,
    thresholds,
    checks: [],
    allPassed: false,
  };
}

// ── Phase 2 훅 — Phase 1에서는 no-op 유지 (실행계획서 §2 협업 규칙 5) ────────
// Phase 2 착수 시 이 두 함수 "안에만" x402 조회를 채운다. 시그니처 변경 금지.
// x402 왕복 구현 참고: legacy/x402-client, legacy/x402-api

/** P1: 이력이 없거나 오래됐으면 신뢰도 조회 API를 x402로 구매 */
export async function checkTrustFreshness(
  history: OnchainHistorySummary,
): Promise<Phase2HookResult> {
  void history;
  return { needed: false };
}

/** P9: 환불 불일치가 기준을 넘으면 증빙 API를 x402로 구매해 대조 */
export async function checkRefundEvidence(
  result: VerificationResult,
): Promise<Phase2HookResult> {
  void result;
  return { needed: false };
}
