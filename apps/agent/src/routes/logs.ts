/**
 * 대시보드(A, STAGE 6)용 로그 API — 판단 로그·상태 스냅샷을 내려준다.
 * 응답 형식은 @chaincrew/schema의 DashboardSnapshot으로 고정 (A와의 계약).
 */
import { Router } from "express";

import type { AgentStore } from "../store.js";

export function logsRouter(store: AgentStore): Router {
  const router = Router();

  /** 상태머신·잔액·타임라인·판정 로그 스냅샷 */
  router.get("/snapshot", (_request, response) => {
    response.json(store.snapshot());
  });

  /** 회차별 발권·환불 이벤트 원본 — A의 대시보드 타임라인·구매웹 개발용 */
  router.get("/screenings", (_request, response) => {
    response.json(store.batch.map(({ meta, events }) => ({ meta, events })));
  });

  return router;
}
