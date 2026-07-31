// kobis-service.js
// KOBIS 호출 로직 자체는 packages/ai-data(@chaincrew/ai-data)로 이동했다.
// 이 파일은 그 패키지를 이 서버(브라우저 CORS 우회용 프록시)에 연결하는
// 얇은 어댑터로만 남긴다 — 로직 중복 방지.

import { KobisClient, getRecentDailyAudience } from "@chaincrew/ai-data";

const client = new KobisClient({ apiKey: process.env.KOBIS_API_KEY });

export async function fetchMovieInfo(movieCd) {
  return client.getMovieInfo(movieCd);
}

export async function fetchDailyAudience(movieCd, days = 7) {
  return getRecentDailyAudience(client, movieCd, days);
}
