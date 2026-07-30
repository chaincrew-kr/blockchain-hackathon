/**
 * Express 앱 조립 — 포트 바인딩과 분리해 두어야 테스트가 서버를 띄우지 않고도
 * 라우트를 검증할 수 있다. 실제 기동은 server.ts가 한다.
 */
import express, { type Express } from "express";

import { errorHandler, notFound, requestContext } from "./middleware.js";
import type { PipelineDeps } from "./pipeline.js";
import { batchRouter } from "./routes/batch.js";
import { logsRouter } from "./routes/logs.js";
import type { AgentStore } from "./store.js";

export function createApp(store: AgentStore, deps: PipelineDeps): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());
  app.use(requestContext);

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.use("/api", logsRouter(store));
  app.use("/api", batchRouter(store, deps));

  // 순서 중요 — 404는 모든 라우트 뒤, 오류 처리기는 가장 마지막.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
