import { describe, expect, it } from "vitest";

import { StubChainGateway } from "../src/chain/gateway.js";
import {
  ANOMALOUS_SCREENING_ID,
  DEMO_THEATER,
  demoBatch,
  NORMAL_SCREENING_ID,
  TICKET_PRICE,
} from "../src/fixtures/screenings.js";
import { netAmountOf, runSettlementBatch } from "../src/pipeline.js";
import { AgentStore } from "../src/store.js";

describe("runSettlementBatch — STAGE 3→4→체인 호출", () => {
  it("정상 회차는 settle_batch, 이상 회차는 mark_disputed", async () => {
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

    expect(gateway.calls).toEqual([
      {
        instruction: "settle_batch",
        screeningId: NORMAL_SCREENING_ID,
        amount: 18 * TICKET_PRICE,
      },
      {
        instruction: "mark_disputed",
        screeningId: ANOMALOUS_SCREENING_ID,
        amount: 9 * TICKET_PRICE,
      },
    ]);
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
    expect(s.timeline).toHaveLength(2);
  });
});

describe("netAmountOf", () => {
  it("발권 − 환불", () => {
    expect(netAmountOf(demoBatch[0].events)).toBe(18 * TICKET_PRICE);
  });
});
