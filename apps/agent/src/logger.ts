/**
 * 구조화 로그 — Cloud Logging이 파싱할 수 있는 JSON 한 줄 형식.
 *
 * Cloud Run은 stdout/stderr로 나간 **JSON 한 줄**을 구조화 로그 엔트리로 자동
 * 파싱한다. `severity`와 `message`가 예약 필드이고 나머지는 jsonPayload로
 * 들어가서 로그 탐색기에서 필터링된다 (예: `jsonPayload.requestId="..."`).
 *
 * 여러 줄로 쪼개지면 Cloud Logging이 별개 엔트리로 인식하므로
 * `console.log`에 객체를 그대로 넘기지 말 것.
 */

export type Severity = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export type LogFields = Record<string, unknown>;

export interface Logger {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, error?: unknown, fields?: LogFields): void;
  /** 공통 필드(requestId 등)를 물려받은 하위 로거 */
  child(fields: LogFields): Logger;
}

/** Error를 JSON 직렬화 가능한 형태로 — stack은 Cloud Logging에서 접히므로 포함한다. */
function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error.cause === undefined
          ? {}
          : { cause: String((error.cause as Error)?.message ?? error.cause) }),
      },
    };
  }
  return { error: { message: String(error) } };
}

function emit(severity: Severity, message: string, fields: LogFields): void {
  const line = JSON.stringify({ severity, message, ...fields });
  // ERROR 이상은 stderr로 — Cloud Run 로그에서 오류만 골라보기 쉬워진다.
  const stream =
    severity === "ERROR" || severity === "CRITICAL"
      ? process.stderr
      : process.stdout;
  stream.write(`${line}\n`);
}

export function createLogger(base: LogFields = {}): Logger {
  return {
    info(message, fields) {
      emit("INFO", message, { ...base, ...fields });
    },
    warn(message, fields) {
      emit("WARNING", message, { ...base, ...fields });
    },
    error(message, error, fields) {
      emit("ERROR", message, {
        ...base,
        ...fields,
        ...(error === undefined ? {} : serializeError(error)),
      });
    },
    child(fields) {
      return createLogger({ ...base, ...fields });
    },
  };
}

export const logger = createLogger();

/**
 * Cloud Trace 연동 — Cloud Run이 넣어주는 `X-Cloud-Trace-Context`를
 * Cloud Logging이 인식하는 필드로 바꾼다. 이게 있으면 하나의 요청에서 나온
 * 로그가 트레이스 단위로 묶여 보인다.
 *
 * 헤더 형식: `TRACE_ID/SPAN_ID;o=1`
 */
export function traceFields(traceHeader: string | undefined): LogFields {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!traceHeader || !project) return {};

  const [traceId] = traceHeader.split("/");
  if (!traceId) return {};

  return {
    "logging.googleapis.com/trace": `projects/${project}/traces/${traceId}`,
  };
}
