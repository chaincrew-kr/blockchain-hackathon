import type { ApiErrorCode } from "@chaincrew/schema";

/**
 * 에이전트 오류 분류 — HTTP 상태코드를 여기서만 정한다.
 *
 * 원칙: **호출자가 고칠 수 있으면 4xx, 우리·외부 시스템 문제면 5xx.**
 * 대시보드(A)가 재시도할지 사람을 부를지 판단해야 하므로 뭉뚱그려 500을
 * 던지지 않는다.
 *
 * 응답 본문은 `{ error: { code, message, requestId } }`로 고정한다 —
 * A가 `code`로 분기하고 `requestId`로 Cloud Logging을 검색할 수 있게.
 */

export class AgentError extends Error {
  constructor(
    readonly status: number,
    /** A가 분기에 쓰는 안정적인 식별자 — 메시지 문구와 달리 바뀌지 않는다. */
    readonly code: ApiErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** 400 — 요청 본문·파라미터가 잘못됨. 같은 요청을 재시도해도 실패한다. */
export class BadRequestError extends AgentError {
  constructor(message: string, code: ApiErrorCode = "bad_request") {
    super(400, code, message);
  }
}

/** 404 — 없는 경로·리소스. */
export class NotFoundError extends AgentError {
  constructor(message: string, code: ApiErrorCode = "not_found") {
    super(404, code, message);
  }
}

/**
 * 409 — 지금 상태에서는 할 수 없는 요청. 배치가 이미 실행 중일 때 쓴다.
 * 재시도 자체는 의미가 있으므로 4xx이되 400과 구분한다.
 */
export class ConflictError extends AgentError {
  constructor(message: string, code: ApiErrorCode = "conflict") {
    super(409, code, message);
  }
}

/**
 * 502 — 체인 호출 실패. 우리 로직은 정상인데 업스트림(Solana RPC·프로그램)이
 * 실패한 경우다. 500과 구분해야 "재시도하면 될 수도 있는 상황"임을 A가 안다.
 */
export class ChainCallError extends AgentError {
  constructor(
    message: string,
    readonly instruction: string,
    options?: { cause?: unknown },
  ) {
    super(502, "chain_call_failed", message, options);
  }
}

export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError;
}
