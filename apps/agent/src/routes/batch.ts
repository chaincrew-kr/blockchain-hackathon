/**
 * 배치 트리거 API — 대시보드의 "정산일 도래" 버튼이 부른다 (전역 결정 G2:
 * 시간 압축은 버튼 트리거, Scheduler는 코드 존재 증명으로 대체).
 *
 * POST /api/batch/trigger → STAGE 3(위험조정검증) → STAGE 4(판정) → 체인 호출
 * POST /api/batch/reset   → 리허설용 초기화
 *
 * **멱등성**: 정산은 돈을 움직이므로 같은 배치가 두 번 실행되면 안 된다.
 * 데모에서 버튼을 연타하거나 Scheduler와 버튼이 겹쳐 들어와도 안전해야 한다.
 *
 *   실행 중  → 409 (진행 중이니 기다려라)
 *   완료됨   → 200 + 기존 결과 재생 (재실행하지 않음, replayed: true)
 *   미실행   → 실행
 */
import { Router } from "express";
import type { BatchRunResponse } from "@chaincrew/schema";

import { ConflictError } from "../errors.js";
import { DEMO_THEATER } from "../fixtures/screenings.js";
import type { BatchRunResult, PipelineDeps } from "../pipeline.js";
import { runSettlementBatch } from "../pipeline.js";
import type { AgentStore } from "../store.js";

function toResponse(
  result: BatchRunResult,
  replayed: boolean,
  movieId: string,
  chainMode: BatchRunResponse["chainMode"],
): BatchRunResponse {
  return {
    movieId,
    theater: result.theater,
    chainMode,
    /** true면 이번 요청이 새로 실행한 게 아니라 기존 결과를 다시 준 것 */
    replayed,
    decisions: result.outcomes.map((o) => o.decision),
    timeline: result.timeline,
  };
}

export function batchRouter(
  store: AgentStore,
  deps: PipelineDeps,
  theater = DEMO_THEATER,
  movieId = "indie-demo-001",
  chainMode: BatchRunResponse["chainMode"] = "stub",
): Router {
  const router = Router();

  router.post("/batch/trigger", async (request, response, next) => {
    // 이미 끝난 배치는 다시 돌리지 않고 같은 결과를 돌려준다 — 버튼 연타 방어.
    const completed = store.lastBatchRun;
    if (completed) {
      request.log.info("batch trigger replayed", {
        theater: completed.theater,
        decisionCount: completed.outcomes.length,
      });
      response.json(toResponse(completed, true, movieId, chainMode));
      return;
    }

    // 검사와 점유는 첫 await 이전에 — 동시 요청 두 개가 함께 통과하면 이중 정산.
    if (!store.tryBeginRun()) {
      next(
        new ConflictError(
          "settlement batch already in progress",
          "batch_in_progress",
        ),
      );
      return;
    }

    try {
      const result = await runSettlementBatch(theater, store.batch, deps);
      store.recordBatchRun(result);

      const held = result.outcomes.filter(
        (o) => o.decision.verdict === "partial-hold",
      );
      request.log.info("batch completed", {
        theater: result.theater,
        screenings: result.outcomes.length,
        heldScreenings: held.length,
        heldAmount: held.reduce((sum, o) => sum + o.decision.heldAmount, 0),
      });

      response.json(toResponse(result, false, movieId, chainMode));
    } catch (error) {
      // 슬롯을 반드시 놓아준다 — 안 그러면 이후 요청이 영원히 409를 받는다.
      store.abortRun();
      next(error);
    }
  });

  /**
   * 리허설용 초기화. 실행계획서 §5의 "Devnet 전체 흐름 3회 이상 반복"을 하려면
   * 멱등성 잠금을 풀 수단이 필요하다. 실행 중에는 거부한다.
   */
  router.post("/batch/reset", (request, response, next) => {
    if (store.runState === "running") {
      next(
        new ConflictError(
          "cannot reset while a batch is running",
          "batch_in_progress",
        ),
      );
      return;
    }

    store.reset();
    request.log.warn("batch state reset", { by: "api" });
    response.json({ status: "reset", runState: store.runState });
  });

  return router;
}
