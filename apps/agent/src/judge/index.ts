/**
 * STAGE 4 정산 실행 판단 — D(판정 파이프라인) + A(Gemini 프롬프트) 공동 소유.
 *
 * 입력:  STAGE 3 검증 결과 + 회차 메타
 * 출력:  진행 / 부분 보류 판정 + 근거 조항 + Gemini 자연어 근거 리포트
 *
 * ⚠️ AI 심사 감점 주의(실행계획서 STAGE 4): 화면에 "보류됨"만 뜨면 룰베이스로
 *    보인다. 반드시 "왜"를 Gemini 생성 자연어(narrative)로 노출할 것.
 */
import type {
  JudgeDecision,
  ScreeningMeta,
  VerificationResult,
} from "@chaincrew/schema";

export async function judgeSettlement(
  verification: VerificationResult,
  meta: ScreeningMeta,
): Promise<JudgeDecision> {
  // TODO(D): 검증 결과 종합 → 진행 vs 부분 보류 확정
  // TODO(D): 임계 미달이어도 이상 패턴(심야 회차 점유율 급등 등) Gemini 플래그
  // TODO(A+D): Gemini 자연어 근거 생성 프롬프트 — 근거 조항·적용 정책 포함
  void meta;
  return {
    screeningId: verification.screeningId,
    verdict: verification.allPassed ? "proceed" : "partial-hold",
    heldAmount: 0,
    basisClauses: [],
    narrative: "TODO: Gemini 근거 리포트",
    decidedAt: Date.now(),
  };
}
