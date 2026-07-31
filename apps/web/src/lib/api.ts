// src/lib/api.ts
// apps/web/server의 /api/extract를 호출하는 함수.
// 서버는 로컬 개발 중 http://localhost:8787 에서 떠 있어야 함.

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

export interface KobisMovieInfo {
  movieNm: string;
  openDt: string;
  genres: { genreNm: string }[];
  directors: { peopleNm: string }[];
  companys: { companyNm: string; companyPartNm: string }[];
  audits: { watchGradeNm: string }[];
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
