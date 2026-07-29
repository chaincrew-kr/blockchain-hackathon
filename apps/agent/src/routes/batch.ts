/**
 * 배치 트리거 API — 대시보드의 "정산일 도래" 버튼이 부른다 (전역 결정 G2:
 * 시간 압축은 버튼 트리거, Scheduler는 코드 존재 증명으로 대체).
 *
 * POST /api/batch/trigger → STAGE 3(위험조정검증) → STAGE 4(판정) → 체인 호출
 */
import { Router } from "express";

import type { PipelineDeps } from "../pipeline.js";
import { runSettlementBatch } from "../pipeline.js";
import type { AgentStore } from "../store.js";
import { DEMO_THEATER } from "../fixtures/screenings.js";

export function batchRouter(store: AgentStore, deps: PipelineDeps): Router {
  const router = Router();

  router.post("/batch/trigger", async (_request, response) => {
    try {
      const result = await runSettlementBatch(DEMO_THEATER, store.batch, deps);
      store.recordBatchRun(result);
      response.json({
        theater: result.theater,
        decisions: result.outcomes.map((o) => o.decision),
        timeline: result.timeline,
      });
    } catch (error) {
      console.error("batch trigger failed:", error);
      response.status(500).json({ error: "batch trigger failed" });
    }
  });

  return router;
}
