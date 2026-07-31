// kobis-service.js
// KOBIS 오픈API 프록시 로직. 브라우저에서 직접 호출 시 CORS로 막히므로
// 이 서버를 거쳐서 호출한다. KOBIS는 HTTPS 미지원(http만 제공) — Node 서버에서
// 호출하니 브라우저 "혼합 콘텐츠(mixed content)" 문제도 없다.

const KOBIS_BASE = "http://www.kobis.or.kr/kobisopenapi/webservice/rest";

function pad(n) {
  return String(n).padStart(2, "0");
}
function toYmd(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}
function toLabel(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 영화 상세정보 (감독·배급사·개봉일 등). 순위와 무관하게 항상 데이터가 있다. */
export async function fetchMovieInfo(movieCd) {
  const key = process.env.KOBIS_API_KEY;
  if (!key) throw new Error("KOBIS_API_KEY 환경변수가 설정되어 있지 않습니다.");

  const url = `${KOBIS_BASE}/movie/searchMovieInfo.json?key=${key}&movieCd=${movieCd}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.movieInfoResult) {
    throw new Error(
      "KOBIS 응답 형식이 예상과 다릅니다: " + JSON.stringify(data),
    );
  }
  return data.movieInfoResult.movieInfo;
}

async function fetchOneDayAudience(movieCd, date, key) {
  const targetDt = toYmd(date);
  // itemPerPage를 넉넉히 키워서 상위권 밖 소형 개봉작도 잡힐 확률을 높인다.
  const url = `${KOBIS_BASE}/boxoffice/searchDailyBoxOfficeList.json?key=${key}&targetDt=${targetDt}&itemPerPage=100`;
  const res = await fetch(url);
  const data = await res.json();
  const list = data.boxOfficeResult?.dailyBoxOfficeList ?? [];
  const found = list.find((m) => m.movieCd === movieCd);
  return {
    d: toLabel(date),
    v: found ? Number(found.audiCnt) : 0, // 순위 밖이면 0 — 데이터 없음을 정직하게 표시
  };
}

/** 최근 N일 관객수. 순위권 밖인 날은 0으로 채운다 (거짓으로 채우지 않음). */
export async function fetchDailyAudience(movieCd, days = 7) {
  const key = process.env.KOBIS_API_KEY;
  if (!key) throw new Error("KOBIS_API_KEY 환경변수가 설정되어 있지 않습니다.");

  const today = new Date();
  const dates = [];
  for (let i = days; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i); // 오늘 데이터는 아직 집계 전이라 어제까지만
    dates.push(d);
  }
  return Promise.all(dates.map((d) => fetchOneDayAudience(movieCd, d, key)));
}
