/**
 * [온보딩] 결제 전 402 챌린지 확인 도구. `npm run inspect:402`로 실행.
 *
 * 결제 기능이 전혀 없는 "그냥 fetch"로 유료 API를 호출해서,
 * 서버가 뭐라고 요구하는지(얼마를, 어느 네트워크에서, 어느 주소로)를 눈으로
 * 확인하는 용도다. 돈은 1원도 나가지 않는다.
 *
 * 입력:  .env의 RESOURCE_SERVER_URL (기본 localhost:4021)
 * 출력:  HTTP 상태(정상이면 402) + payment-required 헤더(base64 챌린지) + 본문
 *        → 헤더를 base64 디코딩하면 amount/asset/payTo/feePayer가 보인다.
 * 종료코드: 402가 아니면 1 (서버가 결제 요구를 안 하고 있다는 뜻 = 설정 문제)
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: new URL("../../../.env", import.meta.url), quiet: true });

async function main(): Promise<void> {
  const baseUrl = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
  const response = await fetch(`${baseUrl}/api/costly-data`);

  console.log(`HTTP ${response.status} ${response.statusText}`);
  console.log("payment-required:", response.headers.get("payment-required"));
  console.log("body:", await response.text());

  if (response.status !== 402) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
