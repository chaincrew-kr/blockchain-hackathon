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
import {
  DEMO_CONTRACT_TERMS,
  templateNarrative,
  type ContractTerms,
  type NarrativeGenerator,
} from "@chaincrew/ai-data";

/** 비율(0~1) → 백분율 문자열. 비율이 아닌 값에는 쓰지 말 것. */
function percent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

/**
 * 실패 검증 → 계약 근거 조항 문구.
 *
 * 검사마다 단위가 다르다 — 환불률·무료비율은 **비율**, 발권 초과는 **건수**,
 * 해시 연속성은 **문자열**이다. 하나의 포맷터로 뭉뚱그리면 좌석 50석이
 * "5000%"로 표시되므로 검사별로 나눠 쓴다.
 *
 * 무료 발권만 계약 상한(제5조)과 보류 임계가 둘 다 있어서 두 층위를 함께
 * 적는다 — 계약서에는 5%라 적혀 있는데 화면이 임계값만 말하면 어긋나 보인다.
 */
function basisClause(check: CheckResult, terms: ContractTerms): string {
  switch (check.check) {
    case "free-rate": {
      const { article, cap } = terms.freeTicket;
      const observed = percent(Number(check.observed));
      const threshold = percent(Number(check.threshold));
      return cap === null
        ? `${article} — 보류 임계 ${threshold} 대비 ${observed} 발권`
        : `${article} — 계약 상한 ${percent(cap)} 대비 ${observed} 발권 ` +
            `(보류 임계 ${threshold} 초과)`;
    }
    case "refund-rate": {
      const { article, cap } = terms.refund;
      const observed = percent(Number(check.observed));
      const threshold = percent(Number(check.threshold));
      return cap === null
        ? `${article} — 보류 임계 ${threshold} 대비 환불률 ${observed}`
        : `${article} — 계약 상한 ${percent(cap)} 대비 환불률 ${observed} ` +
            `(보류 임계 ${threshold} 초과)`;
    }
    case "over-issue":
      // 건수·좌석수는 비율이 아니다 — 백분율로 바꾸면 "5000%석"이 된다.
      return (
        `${terms.seating.article} — 좌석수 ${check.threshold}석 대비 ` +
        `${check.observed}건 발권`
      );
    case "hash-chain":
      return `${terms.record.article} — 발권 기록 연속성 훼손 (${check.observed})`;
  }
}

export async function judgeSettlement(
  verification: VerificationResult,
  meta: ScreeningMeta,
  /** 이 회차의 귀속 대상 금액 (발권 − 환불, USDC 최소단위) — 보류 시 격리 금액 */
  netAmount: number,
  narrativeGenerator: NarrativeGenerator = templateNarrative,
  contractTerms: ContractTerms = DEMO_CONTRACT_TERMS,
): Promise<JudgeDecision> {
  const failed = verification.checks.filter((c) => !c.passed);
  const verdict = verification.allPassed ? "proceed" : "partial-hold";
  const heldAmount = verdict === "partial-hold" ? netAmount : 0;
  const basisClauses = failed.map((c) => basisClause(c, contractTerms));

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
