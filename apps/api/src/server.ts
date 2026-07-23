/**
 * [온보딩] 서버 부트스트랩 — .env 로드 → 설정 검증 → Express 앱 기동.
 * `npm run dev`가 실행하는 진입점이다. 설정이 잘못됐으면 켜기 전에 죽는다(fail fast).
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: new URL("../../../.env", import.meta.url), quiet: true });

import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

try {
  const config = loadConfig();
  const app = createApp(config);

  app.listen(config.port, () => {
    console.log(`x402 server listening on http://localhost:${config.port}`);
    console.log(`Paid endpoint: GET /api/costly-data (${config.price} USDC)`);
    console.log(`Network: ${config.network}`);
    console.log(`Receiving wallet: ${config.payTo}`);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
