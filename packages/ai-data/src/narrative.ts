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

/** Gemini 키·네트워크 장애 시 사용하는 결정론적 폴백. */
export const templateNarrative: NarrativeGenerator = {
  async generate(context) {
    const { verification, meta, verdict, heldAmount, basisClauses } = context;
    const failed = verification.checks.filter((check) => !check.passed);

    if (verdict === "proceed") {
      return (
        `회차 ${meta.screeningId}의 발권·환불 기록 ${verification.checks.length}개 항목 ` +
        `검증을 모두 통과했습니다. 환불률·무료 발권 비율이 조정된 보류 임계 이내이고 ` +
        `발권 수가 좌석수(${meta.seatCount}석)를 넘지 않으며 기록 해시가 연속적이므로 ` +
        `계약 규칙에 따라 정산을 진행합니다.`
      );
    }

    const reasons = failed
      .map((check) => {
        switch (check.check) {
          case "free-rate":
            return `무료 발권 비율이 ${percent(Number(check.observed))}로 보류 임계 ${percent(Number(check.threshold))}를 초과`;
          case "refund-rate":
            return `환불률이 ${percent(Number(check.observed))}로 보류 임계 ${percent(Number(check.threshold))}를 초과`;
          case "over-issue":
            return `발권 수 ${check.observed}건이 좌석수 ${check.threshold}석을 초과`;
          case "hash-chain":
            return `발권 기록 해시 연속성이 깨짐(${check.observed}) — 기록 누락·변조 가능성`;
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
