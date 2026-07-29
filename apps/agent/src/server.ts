/**
 * [담당: D] S5 정산 에이전트 서버 — STAGE 3(위험조정검증) · STAGE 4(정산 실행 판단).
 *
 * 흐름(실행계획서 §1): 배치 트리거(P7)
 *   → risk-check: 온체인 이력 조회 → 임계값 조정 → 정합성 검증 4종
 *   → judge: 진행/부분 보류 판정 + Gemini 자연어 근거
 *   → 진행이면 B의 settle_batch, 보류면 C의 mark_disputed 호출
 * routes/ 는 대시보드(A, STAGE 6)에 판단 로그를 내려주는 API.
 */
import "dotenv/config";
import express from "express";

import { logsRouter } from "./routes/logs.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.use("/api", logsRouter);

const port = Number(process.env.AGENT_PORT ?? 4030);
app.listen(port, () => {
  console.log(`settlement agent listening on http://localhost:${port}`);
});
