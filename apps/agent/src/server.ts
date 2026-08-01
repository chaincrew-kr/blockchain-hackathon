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

import { createNarrativeGeneratorFromEnv } from "@chaincrew/ai-data";

import { createApp, parseAllowedOrigins } from "./app.js";
import { AnchorChainGateway, createChainGateway } from "./chain/index.js";
import { demoBatch } from "./fixtures/screenings.js";
import { logger } from "./logger.js";
import { AgentStore } from "./store.js";

const store = new AgentStore(demoBatch);
const narrative = createNarrativeGeneratorFromEnv();
const chain = createChainGateway();
const deps = {
  chainGateway: chain.gateway,
  ...(chain.historyProvider ? { historyProvider: chain.historyProvider } : {}),
  narrativeGenerator: narrative.generator,
};

const allowedOrigins = parseAllowedOrigins(process.env.AGENT_CORS_ORIGINS);
const app = createApp(store, deps, {
  chainMode: chain.mode,
  allowedOrigins,
  ...(chain.theater ? { theater: chain.theater } : {}),
});

// Cloud Run은 PORT를 주입한다 — 로컬 개발은 .env의 AGENT_PORT를 계속 쓴다.
const port = Number(process.env.PORT ?? process.env.AGENT_PORT ?? 4030);
// 컨테이너에서는 0.0.0.0으로 바인딩해야 외부에서 닿는다.
const server = app.listen(port, "0.0.0.0", () => {
  logger.info("settlement agent started", {
    port,
    chainGateway: chain.mode,
    authority: chain.authority,
    narrativeGenerator: narrative.mode,
    allowedOrigins,
    screenings: store.batch.length,
  });

  // 설정 오류를 데모 도중이 아니라 기동 직후에 드러낸다. 실패해도 서버는 살린다.
  if (chain.gateway instanceof AnchorChainGateway) {
    chain.gateway
      .preflight()
      .then((info) => logger.info("chain preflight ok", { ...info }))
      .catch((error) => logger.error("chain preflight failed", error));
  }
});

// Cloud Run은 인스턴스를 줄일 때 SIGTERM을 보낸다 — 진행 중인 요청을 흘려보낸다.
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down");
  server.close(() => process.exit(0));
});
