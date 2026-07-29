/**
 * 판정 근거 자연어 생성 — A(Gemini 프롬프트)와의 공동 소유 지점.
 *
 * Phase 1 기본은 템플릿 문자열(templateNarrative) — A 없이도 파이프라인이 완주된다.
 * A가 Gemini 프롬프트를 붙일 때는 NarrativeGenerator 구현체 하나만 추가하면 되고,
 * 판정 로직(index.ts)은 손대지 않는다.
 *
 * ⚠️ AI 심사 감점 주의(실행계획서 STAGE 4): 최종 데모는 반드시 Gemini 생성
 *    자연어로 교체할 것 — 템플릿은 개발용 fallback이다.
 */
import type { ScreeningMeta, VerificationResult } from "@chaincrew/schema";

export interface NarrativeContext {
  verification: VerificationResult;
  meta: ScreeningMeta;
  verdict: "proceed" | "partial-hold";
  heldAmount: number;
  basisClauses: string[];
}

export interface NarrativeGenerator {
  generate(context: NarrativeContext): Promise<string>;
}

function percent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

/** 개발·리허설용 템플릿 — 측정값/임계값을 문장으로 풀어쓴다. */
export const templateNarrative: NarrativeGenerator = {
  async generate(context) {
    const { verification, meta, verdict, heldAmount, basisClauses } = context;
    const failed = verification.checks.filter((c) => !c.passed);

    if (verdict === "proceed") {
      return (
        `회차 ${meta.screeningId}의 발권·환불 기록 ${verification.checks.length}개 항목 ` +
        `검증을 모두 통과했습니다. 환불률·무료 발권 비율이 조정 임계값 이내이고 ` +
        `발권 수가 좌석수(${meta.seatCount}석)를 넘지 않으며 기록 해시가 연속적이므로 ` +
        `계약 규칙에 따라 정산을 진행합니다.`
      );
    }

    const reasons = failed
      .map((c) => {
        switch (c.check) {
          case "free-rate":
            return `무료 발권 비율이 ${percent(Number(c.observed))}로 상한 ${percent(Number(c.threshold))}를 초과`;
          case "refund-rate":
            return `환불률이 ${percent(Number(c.observed))}로 상한 ${percent(Number(c.threshold))}를 초과`;
          case "over-issue":
            return `발권 수 ${c.observed}건이 좌석수 ${c.threshold}석을 초과`;
          case "hash-chain":
            return `발권 기록 해시 연속성이 깨짐(${c.observed}) — 기록 누락·변조 가능성`;
        }
      })
      .join("하였고, ");

    const clauseText =
      basisClauses.length > 0 ? ` 근거 조항: ${basisClauses.join(" / ")}.` : "";

    return (
      `회차 ${meta.screeningId}에서 ${reasons}하여 해당 회차 귀속분 ` +
      `${heldAmount.toLocaleString()} (USDC 최소단위)를 분쟁 격리(Disputed)로 보류합니다. ` +
      `정상 회차의 정산은 예정대로 진행되며, 보류분은 증빙 확인 후 해제할 수 있습니다.` +
      clauseText
    );
  },
};

// TODO(A+D): GeminiNarrativeGenerator — Structured Output으로 NarrativeContext를
// 넘기고 근거 조항·적용 정책이 포함된 자연어 리포트를 받는다. (STAGE 4 공동 소유)
