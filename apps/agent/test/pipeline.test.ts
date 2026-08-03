import { describe, expect, it } from "vitest";

import { StubChainGateway } from "../src/chain/gateway.js";
import {
  ANOMALOUS_SCREENING_ID,
  DEMO_MOVIE_ID,
  DEMO_THEATER,
  demoBatch,
  demoSettlement,
  TICKET_PRICE,
} from "../src/fixtures/screenings.js";
import { netAmountOf, runSettlementBatch } from "../src/pipeline.js";
import { AgentStore } from "../src/store.js";

describe("runSettlementBatch — STAGE 3→4→체인 호출", () => {
  it("보류 격리 → 검증 기록 → 일괄 정산 순서로 호출한다", async () => {
    const gateway = new StubChainGateway();
    const result = await runSettlementBatch(DEMO_THEATER, demoBatch, {
      chainGateway: gateway,
    });

    expect(result.outcomes).toHaveLength(2);

    const [normal, anomalous] = result.outcomes;
    expect(normal.decision.verdict).toBe("proceed");
    expect(normal.decision.heldAmount).toBe(0);
    // 유료 19 − 환불 1 = 18매
    expect(normal.netAmount).toBe(18 * TICKET_PRICE);

    expect(anomalous.decision.verdict).toBe("partial-hold");
    expect(anomalous.decision.heldAmount).toBe(9 * TICKET_PRICE);
    expect(anomalous.decision.basisClauses.join()).toContain("무료 발권 상한");
    expect(anomalous.decision.narrative).not.toContain("TODO");

    // 온체인 제약 순서: 격리가 settle 전에, verify가 settle의 게이트를 연다.
    expect(gateway.calls).toEqual([
      {
        instruction: "mark_disputed",
        movieId: DEMO_MOVIE_ID,
        screeningId: ANOMALOUS_SCREENING_ID,
        amount: 9 * TICKET_PRICE,
      },
      { instruction: "verify_escrow", movieId: DEMO_MOVIE_ID },
      { instruction: "settle_batch", ...demoSettlement },
    ]);

    // 진행 회차는 공동 settle tx, 보류 회차는 자기 격리 tx를 가리킨다.
    expect(normal.txSignature).toBe(`STUB_SETTLE_${DEMO_MOVIE_ID}`);
    expect(anomalous.txSignature).toBe(
      `STUB_DISPUTE_${ANOMALOUS_SCREENING_ID}`,
    );
  });

  it("전 회차가 전액 보류면 verify·settle을 건너뛴다", async () => {
    // 이상 회차의 heldAmount = netAmount라 잔여분이 0 — settle_batch를 부르면
    // 온체인이 gross=0으로 거부하므로 파이프라인이 먼저 걸러야 한다.
    const gateway = new StubChainGateway();
    const result = await runSettlementBatch(DEMO_THEATER, [demoBatch[1]], {
      chainGateway: gateway,
    });

    expect(gateway.calls.map((c) => c.instruction)).toEqual(["mark_disputed"]);
    expect(result.timeline).toHaveLength(1);
  });
});

describe("AgentStore.snapshot — 불변식 gross = pending+allocated+disputed+paid+refunded", () => {
  it("배치 전: 전액 Pending", () => {
    const store = new AgentStore(demoBatch);
    const s = store.snapshot();
    expect(s.status).toBe("pending");
    expect(s.pending).toBe(s.grossIn - s.refunded);
    expect(s.allocated + s.disputed + s.paidOut).toBe(0);
    expect(s.decisions).toHaveLength(0);
  });

  it("배치 후: 정상분 allocated, 이상분 disputed, 불변식 유지", async () => {
    const store = new AgentStore(demoBatch);
    const result = await runSettlementBatch(DEMO_THEATER, demoBatch, {
      chainGateway: new StubChainGateway(),
    });
    store.recordBatchRun(result);

    const s = store.snapshot();
    expect(s.status).toBe("disputed");
    expect(s.allocated).toBe(18 * TICKET_PRICE);
    expect(s.disputed).toBe(9 * TICKET_PRICE);
    expect(s.pending + s.allocated + s.disputed + s.paidOut + s.refunded).toBe(
      s.grossIn,
    );
    expect(s.decisions).toHaveLength(2);
    // mark_disputed + verify_escrow + settle_batch
    expect(s.timeline).toHaveLength(3);
  });
});

describe("netAmountOf", () => {
  it("발권 − 환불", () => {
    expect(netAmountOf(demoBatch[0].events)).toBe(18 * TICKET_PRICE);
  });
});
