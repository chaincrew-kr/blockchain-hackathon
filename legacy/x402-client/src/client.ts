/**
 * [온보딩] 구매자(buyer) 쪽 자동 결제 클라이언트. `npm run client`로 실행.
 *
 * 전체 흐름에서의 위치:
 *   [이 클라이언트] ──① 요청──▶ 판매자 서버(apps/api)
 *        ◀─② 402 챌린지─┘
 *   ③ buyer 개인키로 결제 서명 후 같은 요청 자동 재시도 ──▶ ⑦ 200 + 데이터
 *
 * 입력:  .env의 SVM_KEYPAIR_PATH(키파일 경로, 기본) 또는 SVM_PRIVATE_KEY(base58)
 *        + RESOURCE_SERVER_URL(호출할 서버, 기본 localhost:4021)
 * 출력:  콘솔에 응답 데이터(JSON) + 정산 결과(Settlement: 트랜잭션 서명 포함)
 *        → 서명을 explorer.solana.com/tx/<서명>?cluster=devnet 에서 확인 가능
 *
 * ⚠️ 지금 이 코드에 "AI"는 없다 — 402를 받으면 무조건 결제하는 규칙 기반 봇이다.
 *    "살지 말지 판단"(예산·정책·AI)은 아직 없으며 나중 단계에서 얹는다.
 *    온보딩 문서: docs/archive/onboarding/CONCEPTS.md 10번(뭐가 AI인가).
 */
import { base58 } from "@scure/base";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { config as loadEnv } from "dotenv";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";

loadEnv({ path: new URL("../../../.env", import.meta.url), quiet: true });

// buyer 개인키(64바이트)를 읽는다. 두 형식 지원:
//   1순위 SVM_KEYPAIR_PATH — Solana CLI가 만든 JSON 키파일(숫자 배열) 경로
//   2순위 SVM_PRIVATE_KEY — base58 문자열
// 이 키가 곧 "돈을 낼 수 있는 권한"이므로 절대 Git에 올리지 않는다.
async function loadBuyerKeypair(): Promise<Uint8Array> {
  const keypairPath = process.env.SVM_KEYPAIR_PATH?.trim();
  if (keypairPath) {
    const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
    const json = await readFile(resolve(repositoryRoot, keypairPath), "utf8");
    const bytes: unknown = JSON.parse(json);

    if (
      !Array.isArray(bytes) ||
      bytes.length !== 64 ||
      !bytes.every(
        (value) => Number.isInteger(value) && value >= 0 && value <= 255,
      )
    ) {
      throw new Error(
        "SVM_KEYPAIR_PATH must point to a 64-byte Solana CLI keypair JSON file.",
      );
    }

    return Uint8Array.from(bytes);
  }

  const privateKey = process.env.SVM_PRIVATE_KEY?.trim();
  if (privateKey) {
    return base58.decode(privateKey);
  }

  throw new Error(
    "Set SVM_KEYPAIR_PATH to .secrets/buyer-devnet.json before running the client.",
  );
}

async function main(): Promise<void> {
  // 개인키 → signer(서명자). 결제 트랜잭션에 "도장"을 찍을 수 있는 객체.
  const signer = await createKeyPairSignerFromBytes(await loadBuyerKeypair());
  const client = new x402Client().register(
    "solana:*", // 어떤 Solana 네트워크의 챌린지든 이 스킴으로 처리
    new ExactSvmScheme(signer),
  );

  // 핵심 한 줄: 일반 fetch를 "402 감지 → 서명 → 재시도"까지 해주는 fetch로 감싼다.
  // 이 안에서 ①~⑦ 결제 흐름이 전부 자동으로 일어난다.
  const fetchWithPayment = wrapFetchWithPayment(globalThis.fetch, client);
  const baseUrl = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";

  console.log(`Buyer wallet: ${signer.address}`);
  console.log(`Requesting ${baseUrl}/api/costly-data`);

  // 겉보기엔 요청 1번이지만 내부적으로 (1차 요청→402→결제 서명→재시도)가 실행된다.
  const response = await fetchWithPayment(`${baseUrl}/api/costly-data`);
  const body: unknown = await response.json();

  // 응답 헤더(payment-response)에서 정산 결과를 꺼낸다.
  // settlement.transaction이 온체인 트랜잭션 서명 = "돈이 실제로 이동했다"는 증거.
  const settlement = new x402HTTPClient(client).getPaymentSettleResponse(
    (name) => response.headers.get(name),
  );

  console.log("Response:", JSON.stringify(body, null, 2));
  console.log("Settlement:", JSON.stringify(settlement, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
