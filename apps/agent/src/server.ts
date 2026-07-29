/**
 * [담당: D] S5 정산 에이전트 서버 — STAGE 3(위험조정검증) · STAGE 4(정산 실행 판단).
 *
 * 흐름(실행계획서 §1): 배치 트리거(P7, POST /api/batch/trigger)
 *   → risk-check: 온체인 이력 조회 → 임계값 조정 → 정합성 검증 4종
 *   → judge: 진행/부분 보류 판정 + 자연어 근거
 *   → 진행이면 B의 settle_batch, 보류면 C의 mark_disputed 호출
 * routes/ 는 대시보드(A, STAGE 6)에 판단 로그를 내려주는 API.
 *
 * 현재 데이터·체인은 픽스처/스텁이다 — 교체 지점:
 *   발권 로그: fixtures/screenings → A 구매웹·B deposit의 실제 온체인 로그
 *   이력 조회: FixtureHistoryProvider → RpcHistoryProvider (B·C IDL 확정 후)
 *   체인 호출: StubChainGateway → AnchorChainGateway (B·C IDL 확정 후)
 */
import "dotenv/config";
import express from "express";

import { StubChainGateway } from "./chain/gateway.js";
import { demoBatch } from "./fixtures/screenings.js";
import { batchRouter } from "./routes/batch.js";
import { logsRouter } from "./routes/logs.js";
import { AgentStore } from "./store.js";

const store = new AgentStore(demoBatch);
const deps = { chainGateway: new StubChainGateway() };

const app = express();
app.disable("x-powered-by");
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.use("/api", logsRouter(store));
app.use("/api", batchRouter(store, deps));

// Cloud Run은 PORT를 주입한다 — 로컬 개발은 .env의 AGENT_PORT를 계속 쓴다.
const port = Number(process.env.PORT ?? process.env.AGENT_PORT ?? 4030);
// 컨테이너에서는 0.0.0.0으로 바인딩해야 외부에서 닿는다.
app.listen(port, "0.0.0.0", () => {
  console.log(`settlement agent listening on port ${port}`);
});
