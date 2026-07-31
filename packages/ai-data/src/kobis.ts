export interface KobisDailyBoxOfficeEntry {
  rank: number;
  rankChange: number;
  movieCode: string;
  movieName: string;
  openDate: string;
  salesAmount: number;
  audienceCount: number;
  cumulativeAudienceCount: number;
  screenCount: number;
  showCount: number;
}

interface KobisRawEntry {
  rank: string;
  rankInten: string;
  movieCd: string;
  movieNm: string;
  openDt: string;
  salesAmt: string;
  audiCnt: string;
  audiAcc: string;
  scrnCnt: string;
  showCnt: string;
}

interface KobisResponse {
  boxOfficeResult?: {
    dailyBoxOfficeList?: KobisRawEntry[];
  };
  faultInfo?: {
    message?: string;
  };
}

export interface KobisClientConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImplementation?: typeof fetch;
}

function numberOf(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`KOBIS returned an invalid ${field}.`);
  }
  return parsed;
}

// ── 영화 상세정보 (searchMovieInfo) ──────────────────────────────────────
// 대시보드에 실존 독립영화의 감독·배급사·개봉일을 표시하는 용도.
// 일별 박스오피스와 달리 순위와 무관하게 항상 조회 가능하다.

export interface KobisMovieInfo {
  movieName: string;
  openDate: string;
  genres: string[];
  directors: string[];
  companies: { name: string; role: string }[];
  watchGrade: string | null;
}

interface KobisMovieInfoRaw {
  movieNm: string;
  openDt: string;
  genres?: { genreNm: string }[];
  directors?: { peopleNm: string }[];
  companys?: { companyNm: string; companyPartNm: string }[];
  audits?: { watchGradeNm: string }[];
}

interface KobisMovieInfoResponse {
  movieInfoResult?: { movieInfo?: KobisMovieInfoRaw };
  faultInfo?: { message?: string };
}

const MOVIE_INFO_URL =
  "https://www.kobis.or.kr/kobisopenapi/webservice/rest/movie/searchMovieInfo.json";

export class KobisClient {
  private readonly baseUrl: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly config: KobisClientConfig) {
    if (!config.apiKey.trim()) {
      throw new Error("KOBIS API key is required.");
    }
    this.baseUrl =
      config.baseUrl ??
      "https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json";
    this.fetchImplementation = config.fetchImplementation ?? fetch;
  }

  async getDailyBoxOffice(
    targetDate: string,
    itemPerPage = 10,
  ): Promise<KobisDailyBoxOfficeEntry[]> {
    if (!/^\d{8}$/.test(targetDate)) {
      throw new Error("KOBIS targetDate must use YYYYMMDD format.");
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set("key", this.config.apiKey);
    url.searchParams.set("targetDt", targetDate);
    url.searchParams.set("itemPerPage", String(itemPerPage));

    const response = await this.fetchImplementation(url);
    if (!response.ok) {
      throw new Error(`KOBIS request failed with status ${response.status}.`);
    }

    const body = (await response.json()) as KobisResponse;
    if (body.faultInfo?.message) {
      throw new Error(`KOBIS request failed: ${body.faultInfo.message}`);
    }

    const entries = body.boxOfficeResult?.dailyBoxOfficeList;
    if (!Array.isArray(entries)) {
      throw new Error("KOBIS returned an invalid daily box office response.");
    }

    return entries.map((entry) => ({
      rank: numberOf(entry.rank, "rank"),
      rankChange: numberOf(entry.rankInten, "rankInten"),
      movieCode: entry.movieCd,
      movieName: entry.movieNm,
      openDate: entry.openDt,
      salesAmount: numberOf(entry.salesAmt, "salesAmt"),
      audienceCount: numberOf(entry.audiCnt, "audiCnt"),
      cumulativeAudienceCount: numberOf(entry.audiAcc, "audiAcc"),
      screenCount: numberOf(entry.scrnCnt, "scrnCnt"),
      showCount: numberOf(entry.showCnt, "showCnt"),
    }));
  }

  /** 영화 상세정보 — 순위 무관 항상 조회 가능. 대시보드 정보 패널용. */
  async getMovieInfo(movieCode: string): Promise<KobisMovieInfo> {
    const url = new URL(MOVIE_INFO_URL);
    url.searchParams.set("key", this.config.apiKey);
    url.searchParams.set("movieCd", movieCode);

    const response = await this.fetchImplementation(url);
    if (!response.ok) {
      throw new Error(`KOBIS request failed with status ${response.status}.`);
    }

    const body = (await response.json()) as KobisMovieInfoResponse;
    if (body.faultInfo?.message) {
      throw new Error(`KOBIS request failed: ${body.faultInfo.message}`);
    }

    const info = body.movieInfoResult?.movieInfo;
    if (!info) {
      throw new Error("KOBIS returned an invalid movie info response.");
    }

    return {
      movieName: info.movieNm,
      openDate: info.openDt,
      genres: (info.genres ?? []).map((g) => g.genreNm),
      directors: (info.directors ?? []).map((d) => d.peopleNm),
      companies: (info.companys ?? []).map((c) => ({
        name: c.companyNm,
        role: c.companyPartNm,
      })),
      watchGrade: info.audits?.[0]?.watchGradeNm ?? null,
    };
  }
}

// ── 특정 영화의 최근 N일 관객수 ──────────────────────────────────────────
// 일별 박스오피스는 그날 상위권만 주기 때문에, 소형 개봉작은 순위권 밖인
// 날이 많다. 그런 날은 0으로 채운다 (거짓으로 채우지 않음 — 데이터 접근성
// 격차 자체가 독립영화관 인프라가 필요한 이유이기도 하다).

export interface DailyAudiencePoint {
  d: string;
  v: number;
}

function toYmd(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function toLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export async function getRecentDailyAudience(
  client: KobisClient,
  movieCode: string,
  days = 7,
): Promise<DailyAudiencePoint[]> {
  const today = new Date();
  const dates: Date[] = [];
  for (let i = days; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i); // 오늘 데이터는 아직 집계 전이라 어제까지만
    dates.push(d);
  }

  return Promise.all(
    dates.map(async (date) => {
      // itemPerPage를 넉넉히 키워 상위권 밖 소형 개봉작도 잡힐 확률을 높인다.
      const entries = await client.getDailyBoxOffice(toYmd(date), 100);
      const found = entries.find((e) => e.movieCode === movieCode);
      return { d: toLabel(date), v: found ? found.audienceCount : 0 };
    }),
  );
}
