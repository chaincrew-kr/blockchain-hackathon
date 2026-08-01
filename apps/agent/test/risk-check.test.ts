import { describe, expect, it } from "vitest";

import {
  anomalousEvents,
  anomalousMeta,
  buildEventChain,
  normalEvents,
  normalMeta,
  TICKET_PRICE,
} from "../src/fixtures/screenings.js";
import {
  adjustThresholds,
  DEFAULT_THRESHOLDS,
  NEW_THEATER_TIGHTEN_FACTOR,
  verifyIntegrity,
} from "../src/risk-check/index.js";
import type { AdjustedThresholds } from "@chaincrew/schema";

const NEW_THEATER = {
  theater: "T",
  settledBatchCount: 0,
  totalSettledAmount: 0,
  anomalyCount: 0,
  disputeCount: 0,
  isNew: true,
};

const TRUSTED_THEATER = { ...NEW_THEATER, settledBatchCount: 12, isNew: false };

function thresholdsFor(seatCount: number): AdjustedThresholds {
  return {
    maxRefundRate: DEFAULT_THRESHOLDS.maxRefundRate,
    maxFreeRate: DEFAULT_THRESHOLDS.maxFreeRate,
    maxTicketsPerScreening: seatCount,
  };
}

describe("adjustThresholds", () => {
  it("신규 상영관은 보수적(강화) 임계값", () => {
    const t = adjustThresholds(NEW_THEATER, normalMeta);
    expect(t.maxRefundRate).toBeCloseTo(0.1 * NEW_THEATER_TIGHTEN_FACTOR);
    expect(t.maxFreeRate).toBe(0.05);
    expect(t.maxTicketsPerScreening).toBe(normalMeta.seatCount);
  });

  it("이력 있는 상영관은 기본 임계값", () => {
    const t = adjustThresholds(TRUSTED_THEATER, normalMeta);
    expect(t.maxRefundRate).toBe(0.1);
    expect(t.maxFreeRate).toBe(0.05);
  });
});

describe("verifyIntegrity — 데모 3종 검증", () => {
  it("정상 회차는 전 항목 통과", () => {
    const result = verifyIntegrity(
      normalEvents,
      thresholdsFor(normalMeta.seatCount),
      normalMeta,
    );
    expect(result.checks).toHaveLength(3);
    expect(result.allPassed).toBe(true);
  });

  it("P3 무료 발권 상한 초과를 잡는다 (이상 회차 픽스처)", () => {
    const result = verifyIntegrity(
      anomalousEvents,
      thresholdsFor(anomalousMeta.seatCount),
      anomalousMeta,
    );
    const free = result.checks.find((c) => c.check === "free-rate");
    expect(free?.passed).toBe(false);
    expect(free?.observed).toBeCloseTo(2 / 11, 3);
    expect(result.allPassed).toBe(false);
    // 나머지 항목은 통과 — "부분" 보류의 근거가 무료비율 하나임이 명확해야 한다
    expect(
      result.checks
        .filter((c) => c.check !== "free-rate")
        .every((c) => c.passed),
    ).toBe(true);
  });

  it("P3 환불률 초과를 잡는다", () => {
    const events = buildEventChain("SCR-REFUND", [
      { kind: "issue", seat: "A1", amount: TICKET_PRICE },
      { kind: "issue", seat: "A2", amount: TICKET_PRICE },
      { kind: "issue", seat: "A3", amount: TICKET_PRICE },
      { kind: "refund", seat: "A1", amount: TICKET_PRICE },
    ]);
    const result = verifyIntegrity(events, thresholdsFor(50), {
      ...normalMeta,
      screeningId: "SCR-REFUND",
    });
    const refund = result.checks.find((c) => c.check === "refund-rate");
    expect(refund?.passed).toBe(false);
    expect(refund?.observed).toBeCloseTo(1 / 3, 3);
  });

  it("P4 발권수 > 좌석수를 잡는다", () => {
    const events = buildEventChain(
      "SCR-OVER",
      Array.from({ length: 5 }, (_, i) => ({
        kind: "issue" as const,
        seat: `A${i + 1}`,
        amount: TICKET_PRICE,
      })),
    );
    const result = verifyIntegrity(events, thresholdsFor(4), {
      ...normalMeta,
      screeningId: "SCR-OVER",
      seatCount: 4,
    });
    const over = result.checks.find((c) => c.check === "over-issue");
    expect(over?.passed).toBe(false);
    expect(over?.observed).toBe(5);
    expect(over?.threshold).toBe(4);
  });

  it("이벤트가 없으면 비율 검증은 0으로 통과", () => {
    const result = verifyIntegrity(
      [],
      thresholdsFor(normalMeta.seatCount),
      normalMeta,
    );
    expect(result.allPassed).toBe(true);
  });
});
