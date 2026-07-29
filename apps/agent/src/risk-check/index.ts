/**
 * STAGE 3 위험조정검증 — 온체인 이력만으로 완결 (Phase 1).
 *
 * 입력:  STAGE 1 발권·환불 로그(온체인) + 같은 상영관의 과거 정산 이력
 * 출력:  조정된 임계값 + 정합성 검증 4종(P3~P5) 결과
 */
import type {
  AdjustedThresholds,
  CheckResult,
  OnchainHistorySummary,
  Phase2HookResult,
  ScreeningMeta,
  TicketEvent,
  VerificationResult,
} from "@chaincrew/schema";

import { GENESIS_HASH, hashTicketEvent } from "./hash.js";
import { FixtureHistoryProvider, type HistoryProvider } from "./history.js";

/**
 * 정산 보류를 거는 이상탐지 임계값 — SPEC §5 `disputeThresholds` 및
 * 실행계획서 STAGE 4 권장안(P3=10%/15%) 그대로.
 *
 * ⚠️ 계약서의 무료 발권 상한(`compTicketCap`, 0.05)과 **같은 값이 아니다.**
 *   계약 상한 초과 → 계약 위반
 *   이 값 초과     → 자금 격리
 * 계약 위반이라고 곧바로 돈을 묶지 않으려는 완충이므로 일치시키면 안 된다.
 * 계약 조항 값은 judge/contract.ts가 근거 문구용으로 따로 들고 있다.
 */
export const DEFAULT_THRESHOLDS = {
  maxRefundRate: 0.1,
  maxFreeRate: 0.15,
} as const;

/**
 * 신규(이력 없는) 상영관 임계값 강화 배율 — 권장안 −30%.
 * TODO(팀 합의): 조정 폭 최종 수치 확정 (실행계획서 STAGE 3 결정 항목)
 */
export const NEW_THEATER_TIGHTEN_FACTOR = 0.7;

const defaultHistoryProvider: HistoryProvider = new FixtureHistoryProvider();

/** 같은 상영관의 이전 정산 배치 집계 — provider 주입으로 체인 미연결 시에도 동작. */
export async function fetchTheaterHistory(
  theater: string,
  provider: HistoryProvider = defaultHistoryProvider,
): Promise<OnchainHistorySummary> {
  return provider.fetchTheaterHistory(theater);
}

/** 이력 좋은 상영관은 정상 임계값, 신규는 보수적(더 엄격) 임계값. */
export function adjustThresholds(
  history: OnchainHistorySummary,
  meta: ScreeningMeta,
): AdjustedThresholds {
  const tighten = history.isNew ? NEW_THEATER_TIGHTEN_FACTOR : 1;
  return {
    maxRefundRate: DEFAULT_THRESHOLDS.maxRefundRate * tighten,
    maxFreeRate: DEFAULT_THRESHOLDS.maxFreeRate * tighten,
    maxTicketsPerScreening: meta.seatCount,
  };
}

/** 소수점 4자리 반올림 — observed 값이 대시보드에 그대로 노출되므로 보기 좋게. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** P3 환불률: 환불 건수 / 발권 건수 */
function checkRefundRate(
  events: TicketEvent[],
  thresholds: AdjustedThresholds,
): CheckResult {
  const issues = events.filter((e) => e.kind === "issue").length;
  const refunds = events.filter((e) => e.kind === "refund").length;
  const rate = issues === 0 ? 0 : refunds / issues;
  return {
    check: "refund-rate",
    passed: rate <= thresholds.maxRefundRate,
    observed: round4(rate),
    threshold: thresholds.maxRefundRate,
  };
}

/** P3 무료 발권 비율: 금액 0인 발권 / 전체 발권 */
function checkFreeRate(
  events: TicketEvent[],
  thresholds: AdjustedThresholds,
): CheckResult {
  const issues = events.filter((e) => e.kind === "issue");
  const free = issues.filter((e) => e.amount === 0).length;
  const rate = issues.length === 0 ? 0 : free / issues.length;
  return {
    check: "free-rate",
    passed: rate <= thresholds.maxFreeRate,
    observed: round4(rate),
    threshold: thresholds.maxFreeRate,
  };
}

/** P4 발권 초과: 발권 건수 > 좌석수 */
function checkOverIssue(
  events: TicketEvent[],
  thresholds: AdjustedThresholds,
): CheckResult {
  const issues = events.filter((e) => e.kind === "issue").length;
  return {
    check: "over-issue",
    passed: issues <= thresholds.maxTicketsPerScreening,
    observed: issues,
    threshold: thresholds.maxTicketsPerScreening,
  };
}

/** P5 해시 연속성: 각 이벤트의 prevHash가 직전 이벤트 해시와 일치하는지 */
function checkHashChain(events: TicketEvent[]): CheckResult {
  let expected = GENESIS_HASH;
  for (const [i, event] of events.entries()) {
    if (event.prevHash !== expected) {
      return {
        check: "hash-chain",
        passed: false,
        observed: `broken at #${i} (${event.txSignature})`,
        threshold: "continuous",
      };
    }
    expected = hashTicketEvent(event);
  }
  return {
    check: "hash-chain",
    passed: true,
    observed: "continuous",
    threshold: "continuous",
  };
}

/** 정합성 검증 4종: 환불률(P3)·무료비율(P3)·발권초과(P4)·해시연속성(P5) */
export function verifyIntegrity(
  events: TicketEvent[],
  thresholds: AdjustedThresholds,
  meta: ScreeningMeta,
): VerificationResult {
  const checks: CheckResult[] = [
    checkRefundRate(events, thresholds),
    checkFreeRate(events, thresholds),
    checkOverIssue(events, thresholds),
    checkHashChain(events),
  ];
  return {
    screeningId: meta.screeningId,
    thresholds,
    checks,
    allPassed: checks.every((c) => c.passed),
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
