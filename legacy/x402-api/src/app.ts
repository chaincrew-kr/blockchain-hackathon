/**
 * [온보딩] 판매자(merchant) 쪽 x402 유료 API 서버.
 *
 * 전체 흐름에서의 위치:
 *   구매자 클라이언트(packages/agent) ──① 요청──▶ [이 서버]
 *     ── 결제 증명 없음 → ② 402 + "얼마를 어디로 내라" 챌린지 반환
 *     ── 결제 증명 있음 → ④ facilitator에게 검증 위임 → 유효하면 ⑦ 데이터 반환
 *
 * 입력:  HTTP 요청 (결제 증명은 요청 헤더에 실려 옴)
 * 출력:  402(챌린지) 또는 200(JSON 데이터 + payment-response 정산 헤더)
 * 참고:  이 서버에는 개인키가 없다. merchant "공개 주소"만 알고 있음 (보안 설계).
 *        온보딩 문서: docs/onboarding/CONCEPTS.md 3번(등장인물), README 아키텍처.
 */
import express, { type Express } from "express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactSvmScheme } from "@x402/svm/exact/server";

import type { AppConfig } from "./config.js";

export function createApp(config: AppConfig): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  // 결제가 필요 없는 공개 엔드포인트. 서버 살아있는지 확인용.
  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  // facilitator = 결제 검증·정산·수수료 대납을 대행하는 외부 서비스.
  // 이 서버는 결제가 진짜인지 직접 판단하지 않고 여기에 물어본다.
  const facilitator = new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
  });
  const resourceServer = new x402ResourceServer(facilitator).register(
    config.network,
    new ExactSvmScheme(), // "exact" = 지정된 금액을 요청당 1회 결제하는 방식
  );

  // 이 미들웨어가 "돈 안 내면 402" 규칙의 실체.
  // 아래 목록에 등록된 라우트는 결제 증명이 검증되기 전까지 통과하지 못한다.
  app.use(
    paymentMiddleware(
      {
        "GET /api/costly-data": {
          accepts: [
            {
              scheme: "exact",
              price: config.price, // 예: "$0.001" → 402 챌린지의 amount로 변환됨
              network: config.network, // Solana devnet CAIP-2 ID
              payTo: config.payTo, // merchant 공개 주소 (여기로 USDC가 들어옴)
            },
          ],
          description: "ChainCrew premium agent data",
          mimeType: "application/json",
        },
      },
      resourceServer,
    ),
  );

  // 결제 미들웨어를 통과한 요청만 여기 도달한다. 실제 "상품"(데이터) 반환.
  app.get("/api/costly-data", (_request, response) => {
    response.json({
      report: {
        data: "costly data",
        generatedAt: new Date().toISOString(),
        source: "chaincrew-x402",
      },
    });
  });

  return app;
}
