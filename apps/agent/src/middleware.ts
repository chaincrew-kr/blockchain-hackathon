/**
 * 요청 컨텍스트·오류 처리 미들웨어.
 *
 * 모든 요청에 requestId를 붙여서 로그와 오류 응답에 함께 실어 보낸다.
 * 대시보드(A)가 오류 화면의 requestId를 그대로 Cloud Logging에 검색하면
 * 해당 요청의 로그만 볼 수 있다.
 */
import { randomUUID } from "node:crypto";

import type { ErrorRequestHandler, RequestHandler } from "express";

import { isAgentError, NotFoundError } from "./errors.js";
import { logger, traceFields, type Logger } from "./logger.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** 요청별 상관관계 ID — 응답 헤더 X-Request-Id로도 돌려준다. */
      id: string;
      /** requestId가 바인딩된 로거 */
      log: Logger;
    }
  }
}

/** requestId 발급 + 요청/응답 로그. */
export const requestContext: RequestHandler = (request, response, next) => {
  // 클라이언트나 프록시가 이미 붙였으면 그대로 이어받아 추적을 끊지 않는다.
  const inbound = request.get("x-request-id");
  request.id = inbound ?? randomUUID();
  request.log = logger.child({
    requestId: request.id,
    ...traceFields(request.get("x-cloud-trace-context")),
  });

  response.setHeader("X-Request-Id", request.id);

  // 경로는 진입 시점에 고정한다 — Express는 라우터 안에서 request.path를
  // 라우터 기준 상대경로로 바꾸므로, finish 시점에 읽으면 응답이 어디서
  // 끝났는지에 따라 /batch/trigger와 /api/batch/trigger가 섞인다.
  const path = request.originalUrl.split("?")[0] ?? request.originalUrl;
  const startedAt = process.hrtime.bigint();

  response.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    // 헬스체크는 30초마다 들어와서 로그를 덮으므로 정상 응답이면 남기지 않는다.
    if (path === "/health" && response.statusCode < 400) return;

    request.log.info("request completed", {
      method: request.method,
      path,
      status: response.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  });

  next();
};

/** 등록되지 않은 경로 — 404를 오류 처리기로 넘긴다. */
export const notFound: RequestHandler = (request, _response, next) => {
  next(new NotFoundError(`no route for ${request.method} ${request.path}`));
};

/**
 * 최종 오류 처리기. AgentError면 지정된 상태코드로, 아니면 500으로 내린다.
 * 내부 오류 메시지는 밖으로 내보내지 않는다 — 스택·경로가 새어나갈 수 있다.
 */
export const errorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (isAgentError(error)) {
    // 4xx는 호출자 문제라 WARNING, 5xx는 우리 문제라 ERROR.
    const log = request.log ?? logger;
    if (error.status >= 500) {
      log.error("request failed", error, { code: error.code });
    } else {
      log.warn("request rejected", {
        code: error.code,
        status: error.status,
        reason: error.message,
      });
    }

    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        requestId: request.id,
      },
    });
    return;
  }

  (request.log ?? logger).error("unhandled error", error);
  response.status(500).json({
    error: {
      code: "internal_error",
      message: "internal error",
      requestId: request.id,
    },
  });
};
