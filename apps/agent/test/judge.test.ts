/**
 * 판정 근거 문구 테스트 — 검사마다 단위가 다르다는 게 핵심이다.
 *
 * 환불률·무료비율은 비율(0~1), 발권 초과는 건수, 해시는 문자열이다.
 * 하나의 포맷터로 뭉뚱그리면 좌석 50석이 "5000%"로 표시된다.
 */
import type {
  AdjustedThresholds,
  CheckResult,
  ScreeningMeta,
  VerificationResult,
} from "@chaincrew/schema";
import { DEMO_CONTRACT_TERMS } from "@chaincrew/ai-data";
import { describe, expect, it } from "vitest";

import { judgeSettlement } from "../src/judge/index.js";

const thresholds: AdjustedThresholds = {
  maxRefundRate: 0.07,
  maxFreeRate: 0.05,
  maxTicketsPerScreening: 50,
};

const meta: ScreeningMeta = {
  screeningId: "SCR-TEST",
  seatCount: 50,
  averageOccupancy: 0.4,
  historicalRefundRate: 0.04,
};

function verificationWith(check: CheckResult): VerificationResult {
  return {
    screeningId: meta.screeningId,
    thresholds,
    checks: [check],
    allPassed: check.passed,
  };
}

async function clauseFor(check: CheckResult): Promise<string> {
  const decision = await judgeSettlement(verificationWith(check), meta, 1000);
  return decision.basisClauses.join(" ");
}

describe("basisClause — 검사별 단위", () => {
  it("무료 발권: 계약 상한과 보류 임계를 함께 인용한다", async () => {
    const clause = await clauseFor({
      check: "free-rate",
      passed: false,
      observed: 0.182,
      threshold: 0.05,
    });

    // 계약서에는 5%라 적혀 있는데 화면이 임계값만 말하면 어긋나 보인다
    expect(clause).toContain("계약 상한 5%");
    expect(clause).toContain("18.2%");
    expect(clause).toContain("보류 임계 5%");
    expect(clause).toContain(DEMO_CONTRACT_TERMS.freeTicket.article);
  });

  it("발권 초과: 건수·좌석수를 백분율로 바꾸지 않는다", async () => {
    const clause = await clauseFor({
      check: "over-issue",
      passed: false,
      observed: 55,
      threshold: 50,
    });

    expect(clause).toContain("좌석수 50석");
    expect(clause).toContain("55건");
    // 회귀 방지 — 예전에는 "5000%석 대비 5500%건"으로 나왔다
    expect(clause).not.toContain("%");
  });

  it("환불률: 계약 상한과 보류 임계를 함께 인용한다", async () => {
    const clause = await clauseFor({
      check: "refund-rate",
      passed: false,
      observed: 0.12,
      threshold: 0.07,
    });

    expect(clause).toContain("계약 상한 10%");
    expect(clause).toContain("보류 임계 7%");
    expect(clause).toContain("12%");
    expect(clause).toContain(DEMO_CONTRACT_TERMS.refund.article);
  });

  it("해시 연속성: 측정값 문자열을 그대로 싣는다", async () => {
    const clause = await clauseFor({
      check: "hash-chain",
      passed: false,
      observed: "broken at #3 (TX_ABC)",
      threshold: "continuous",
    });

    expect(clause).toContain("broken at #3 (TX_ABC)");
    expect(clause).not.toContain("%");
  });
});

describe("judgeSettlement — 판정", () => {
  it("전 항목 통과면 진행, 보류액 0", async () => {
    const decision = await judgeSettlement(
      verificationWith({
        check: "free-rate",
        passed: true,
        observed: 0.05,
        threshold: 0.05,
      }),
      meta,
      1000,
    );

    expect(decision.verdict).toBe("proceed");
    expect(decision.heldAmount).toBe(0);
    expect(decision.basisClauses).toHaveLength(0);
  });

  it("실패가 있으면 부분 보류, 회차 귀속분 전액 격리", async () => {
    const decision = await judgeSettlement(
      verificationWith({
        check: "over-issue",
        passed: false,
        observed: 55,
        threshold: 50,
      }),
      meta,
      1000,
    );

    expect(decision.verdict).toBe("partial-hold");
    expect(decision.heldAmount).toBe(1000);
    expect(decision.basisClauses).toHaveLength(1);
  });
});
