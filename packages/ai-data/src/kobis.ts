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
  ): Promise<KobisDailyBoxOfficeEntry[]> {
    if (!/^\d{8}$/.test(targetDate)) {
      throw new Error("KOBIS targetDate must use YYYYMMDD format.");
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set("key", this.config.apiKey);
    url.searchParams.set("targetDt", targetDate);

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
}
