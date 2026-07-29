/**
 * 대시보드(A, STAGE 6)용 로그 API — 판단 로그·상태 스냅샷을 내려준다.
 * 응답 형식은 @chaincrew/schema의 DashboardSnapshot으로 고정 (A와의 계약).
 */
import { Router } from "express";

import type { DashboardSnapshot } from "@chaincrew/schema";

export const logsRouter = Router();

logsRouter.get("/snapshot", (_request, response) => {
  // TODO(D): 온체인 상태 + 판단 로그(Firestore) 취합
  const snapshot: DashboardSnapshot = {
    status: "pending",
    grossIn: 0,
    pending: 0,
    allocated: 0,
    disputed: 0,
    paidOut: 0,
    refunded: 0,
    balances: [],
    timeline: [],
    decisions: [],
  };
  response.json(snapshot);
});
