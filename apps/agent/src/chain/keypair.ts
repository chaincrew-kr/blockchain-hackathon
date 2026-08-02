/**
 * 에이전트 서명 키페어 로딩 — Solana CLI JSON 키파일(숫자 배열) 형식.
 *
 * 에이전트는 `settle_batch`·`mark_disputed`의 authority로 서명한다
 * (`MovieEscrow.authority`). 이 키의 권한은 **정상 판정분에만 지급 트랜잭션을
 * 서명하는 것**이고(SPEC 정책 P6), 관객 자금을 임의로 옮길 수는 없다.
 *
 * ⚠️ 경로만 환경변수로 받는다. 키 내용을 환경변수나 로그에 넣지 말 것.
 *    Cloud Run에서는 Secret Manager 볼륨 마운트 경로를 넘긴다.
 */
import { readFileSync } from "node:fs";

import { web3 } from "@coral-xyz/anchor";

/**
 * Solana CLI가 만드는 `[12,34,...]` 형식의 64바이트 시크릿키 파일을 읽는다.
 * `tools/wallet`이 만드는 파일과 같은 형식이다.
 */
export function loadKeypairFile(path: string): web3.Keypair {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(`키페어 파일을 읽을 수 없습니다: ${path}`, { cause });
  }

  let bytes: unknown;
  try {
    bytes = JSON.parse(raw);
  } catch (cause) {
    throw new Error(
      `키페어 파일이 JSON 숫자 배열이 아닙니다: ${path} ` +
        `(Solana CLI 형식이어야 합니다)`,
      { cause },
    );
  }

  if (!Array.isArray(bytes) || bytes.some((b) => typeof b !== "number")) {
    throw new Error(`키페어 파일이 숫자 배열이 아닙니다: ${path}`);
  }
  // 64바이트(시크릿 32 + 공개 32)가 아니면 fromSecretKey가 불친절하게 죽는다.
  if (bytes.length !== 64) {
    throw new Error(
      `키페어 길이가 64가 아닙니다 (${bytes.length}): ${path}. ` +
        `공개키만 담긴 파일이거나 형식이 다를 수 있습니다.`,
    );
  }

  return web3.Keypair.fromSecretKey(Uint8Array.from(bytes as number[]));
}
