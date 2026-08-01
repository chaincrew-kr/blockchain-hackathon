// src/lib/api.ts
// apps/web/server의 /api/extract를 호출하는 함수.
// 서버는 로컬 개발 중 http://localhost:8787 에서 떠 있어야 함.
import type { ApiErrorResponse, BatchRunResponse } from "@chaincrew/schema";

/** 서버(/api/extract)가 그대로 돌려주는 원본 응답 형태.
 *  apps/web/server/extraction-schema.json 의 구조와 1:1로 맞춘다. */
export interface ExtractionApiResponse {
  parties: {
    movieTitle: string;
    distributor: string;
    theater: string;
  };
  rule: {
    revenueBase: string;
    regionSplit: {
      region: string;
      nationality: string;
      split: { THEATER: number; DISTRIBUTOR_POOL: number };
    }[];
    deductions: {
      id: string;
      formula: string;
      round: string;
      order: number;
      exemptionCondition: string;
    }[];
    waterfall: {
      step: number;
      type: "FEE" | "MG_RECOUP" | "RECOUP" | "PROFIT_SPLIT";
      party: string;
      rate: number;
      mgAmount: number;
      mgCurrency: string;
      recoupUntil: string;
      profitSplit: { INVESTORS: number; PRODUCER: number };
    }[];
    ticketPolicy: {
      settlementBase: string;
      discountBearer: string;
      compTicketCap: number;
      refundWindow: string;
      postShowRefund: string;
      reserveRate: number;
    };
    settlementTerms: {
      reportDeadlineDays: number;
      paymentDeadlineDays: number;
      lateInterestRateAnnual: number;
    };
    disputeThresholds: { refundRate: number; freeTicketRate: number };
  };
  evidence: {
    fieldPath: string;
    sourceClause: string;
    sourceQuote: string;
    confidence: number;
  }[];
  conflicts: {
    field: string;
    description: string;
    conflictingClauses: string[];
    severity: "BLOCKING" | "WARNING";
  }[];
  overallConfidence: number;
}

// ── 계약서 추출 ────────────────────────────────────────────────────────

const API_BASE = "http://localhost:8787"; // TODO: 배포 시 환경변수(VITE_API_URL)로 교체

/** 계약서 PDF 파일을 서버에 올려 정산 규칙을 추출한다. */
export async function extractContract(
  file: File,
): Promise<ExtractionApiResponse> {
  const formData = new FormData();
  formData.append("contract", file);

  const res = await fetch(`${API_BASE}/api/extract`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `서버 오류 (${res.status})`);
  }

  return res.json();
}

// ── KOBIS ──────────────────────────────────────────────────────────────

/** @chaincrew/ai-data의 KobisMovieInfo와 동일 형태 (정규화된 필드명). */
export interface KobisMovieInfo {
  movieName: string;
  openDate: string;
  genres: string[];
  directors: string[];
  companies: { name: string; role: string }[];
  watchGrade: string | null;
}

export interface KobisDailyPoint {
  d: string;
  v: number;
}

/** 실존 독립영화 상세정보 (감독·배급사·개봉일). movieCd 생략 시 서버 기본값(하나 코리아) 사용. */
export async function fetchKobisMovieInfo(
  movieCd?: string,
): Promise<KobisMovieInfo> {
  const url = new URL(`${API_BASE}/api/kobis/movie-info`);
  if (movieCd) url.searchParams.set("movieCd", movieCd);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `KOBIS 영화정보 조회 실패 (${res.status})`);
  }
  return res.json();
}

/** 최근 N일 관객수. 일별 박스오피스 순위권 밖인 날은 0으로 온다. */
export async function fetchKobisDaily(
  movieCd?: string,
  days = 7,
): Promise<KobisDailyPoint[]> {
  const url = new URL(`${API_BASE}/api/kobis/daily`);
  if (movieCd) url.searchParams.set("movieCd", movieCd);
  url.searchParams.set("days", String(days));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.error ?? `KOBIS 일별 데이터 조회 실패 (${res.status})`,
    );
  }
  return res.json();
}

// ── 정산 배치 (apps/agent) ────────────────────────────────────────────
//
// 상대 경로("/api/...")로 부른다 — vite.config.ts의 dev proxy가
// "/api" 요청을 apps/agent(4030)로 넘긴다. 프로덕션 빌드에서는 이 프록시가
// 없으므로 별도 리버스 프록시나 절대 URL 설정이 필요하다 (배포 시 TODO).

export class AgentApiError extends Error {
  constructor(
    message: string,
    public readonly code: ApiErrorResponse["error"]["code"],
    public readonly requestId: string,
  ) {
    super(message);
    this.name = "AgentApiError";
  }
}

async function agentFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body: Partial<ApiErrorResponse> = await res.json().catch(() => ({}));
    if (body.error) {
      throw new AgentApiError(
        body.error.message,
        body.error.code,
        body.error.requestId,
      );
    }
    throw new Error(`정산 에이전트 오류 (${res.status})`);
  }
  return res.json();
}

/** 정산 배치 실행 — 이미 완료된 배치가 있으면 재실행하지 않고 같은 결과를 돌려받는다(replayed: true). */
export function triggerBatch(): Promise<BatchRunResponse> {
  return agentFetch<BatchRunResponse>("/api/batch/trigger", {
    method: "POST",
  });
}

/** 리허설용 초기화 — 데모를 반복하려면 배치 실행 후 이걸 호출해 잠금을 푼다. */
export function resetBatch(): Promise<{ status: string; runState: string }> {
  return agentFetch("/api/batch/reset", { method: "POST" });
}

export function describeAgentError(error: unknown): string {
  if (error instanceof AgentApiError) {
    if (error.code === "batch_in_progress") {
      return "이미 정산 배치가 실행 중입니다 — 잠시 후 다시 시도하세요";
    }
    if (error.code === "chain_call_failed") {
      return `체인 호출에 실패했습니다 — RPC/체인 게이트웨이 상태를 확인하세요 (요청 ID: ${error.requestId})`;
    }
    return `${error.message} (요청 ID: ${error.requestId})`;
  }
  return error instanceof Error
    ? error.message
    : "정산 배치 요청에 실패했습니다";
}
