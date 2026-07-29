/**
 * STAGE 4 정산 실행 판단 — D(판정 파이프라인) + A(Gemini 프롬프트) 공동 소유.
 *
 * 입력:  STAGE 3 검증 결과 + 회차 메타 + 회차 귀속 대상 금액
 * 출력:  진행 / 부분 보류 판정 + 근거 조항 + 자연어 근거 리포트
 *
 * "부분 보류"의 단위는 회차다 — 검증에 실패한 회차의 귀속분만 Disputed로 격리하고
 * 나머지 회차는 정상 정산한다 (실행계획서 STAGE 4·5).
 */
import type {
  CheckResult,
  JudgeDecision,
  ScreeningMeta,
  VerificationResult,
} from "@chaincrew/schema";

import { templateNarrative, type NarrativeGenerator } from "./narrative.js";

/**
 * 실패 검증 → 계약 근거 조항 매핑.
 * TODO(A): 가상 계약서 확정 후 조항 번호·문구를 실제 계약서와 일치시킬 것.
 */
function basisClause(check: CheckResult): string {
  const observed =
    typeof check.observed === "number"
      ? `${Math.round(check.observed * 1000) / 10}%`
      : String(check.observed);
  const threshold =
    typeof check.threshold === "number"
      ? `${Math.round(check.threshold * 1000) / 10}%`
      : String(check.threshold);

  switch (check.check) {
    case "free-rate":
      return `제5조(무료 발권 상한) — 상한 ${threshold} 대비 ${observed} 발권`;
    case "refund-rate":
      return `제7조(환불 처리) — 환불률 상한 ${threshold} 대비 ${observed}`;
    case "over-issue":
      return `제4조(발권 관리) — 좌석수 ${threshold}석 대비 ${observed}건 발권`;
    case "hash-chain":
      return `제9조(기록 보존) — 발권 기록 연속성 훼손 (${observed})`;
  }
}

export async function judgeSettlement(
  verification: VerificationResult,
  meta: ScreeningMeta,
  /** 이 회차의 귀속 대상 금액 (발권 − 환불, USDC 최소단위) — 보류 시 격리 금액 */
  netAmount: number,
  narrativeGenerator: NarrativeGenerator = templateNarrative,
): Promise<JudgeDecision> {
  const failed = verification.checks.filter((c) => !c.passed);
  const verdict = verification.allPassed ? "proceed" : "partial-hold";
  const heldAmount = verdict === "partial-hold" ? netAmount : 0;
  const basisClauses = failed.map(basisClause);

  // TODO(D, 시간 되면): 임계 미달이어도 이상 패턴(심야 회차 점유율 급등 등)을
  // Gemini로 플래그 — 리허설에서 출력 불안정하면 컷 (실행계획서 STAGE 4 결정)

  const narrative = await narrativeGenerator.generate({
    verification,
    meta,
    verdict,
    heldAmount,
    basisClauses,
  });

  return {
    screeningId: verification.screeningId,
    verdict,
    heldAmount,
    basisClauses,
    narrative,
    decidedAt: Date.now(),
  };
}
