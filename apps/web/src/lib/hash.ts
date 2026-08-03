// src/lib/hash.ts
// 브라우저 내장 Web Crypto로 SHA-256 해시를 계산한다 (서버 안 거침).
// 계약서 원문 해시(SettlementRule.contractHash)를 온체인 등록 전에 미리
// 계산해두는 용도 — FR-06 "온체인엔 해시만 올라간다" 원칙과 맞물림.

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** movieId — PDA 시드로 쓰이므로 짧고 ASCII-safe해야 함. 계약서 해시 앞부분을 재사용해
 *  한글 제목 슬러그화 문제를 피하고, 계약서 1건당 자연히 고유값이 되게 한다. */
export function movieIdFromContractHash(contractHash: string): string {
  return `mv-${contractHash.slice(0, 16)}`;
}

/** SHA-256 hex 문자열(64자) → 온체인 IDL이 요구하는 [u8; 32] 바이트 배열.
 *  init_escrow 호출 시 contract_hash/rule_hash 인자로 그대로 넘기면 됨. */
export function hexToBytes32(hex: string): Uint8Array {
  if (hex.length !== 64) {
    throw new Error(
      `32바이트 해시가 아닙니다 (hex 길이 ${hex.length}, 64여야 함): ${hex}`,
    );
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** 0~1 사이 소수 비율을 basis point(만분율) 정수로 변환. 예: 0.5 -> 5000.
 *  settle_batch 호출 인자(theater_bps 등)를 만들 때도 반드시 이 함수를 같이 써서,
 *  rule_hash 계산에 쓰인 bps와 실제 온체인에 넘기는 bps가 항상 같은 값이 되게 한다. */
export function toBps(ratio: number): number {
  return Math.round(ratio * 10_000);
}

/**
 * init_escrow에 등록할 rule_hash 계산 (SCHEMA_CONTRACT §11, A·B·D 합의).
 *
 * SettlementRule 전체가 아니라 settle_batch가 실제로 받는 온체인 숫자
 * (rule_version, *_bps 4개 — 이슈 #7 풀 워터폴로 investorProfitBps 추가)만
 * 해시 대상으로 삼는다 — 조항 원문·충돌·승인 여부 등은 온체인 인자로
 * 넘어가지 않으므로 검증 자체가 불가능하다. 인코딩은
 * apps/agent/src/risk-check/hash.ts의 TicketEvent 해시체인과 동일한 "필드를
 * '|'로 join 후 sha256" 방식 — programs/movie_escrow의 settle_batch.rs와
 * 바이트 단위로 일치해야 한다.
 *
 * theaterBps/distributorBps/distributionFeeBps/investorProfitBps는
 * SettlementRule의 revenueShare/distributionFeeRate(0~1 소수) 등을
 * settle_batch에 넘길 때와 동일한 방식으로 basis point(정수, ×10000)로
 * 변환한 값이어야 한다. mgAmount/investmentAmount(init_escrow의 MG·투자
 * 총액)는 이 해시 대상이 아니다 — 매 settle_batch 호출마다 다시 넘어오는
 * 값이 아니라 계정에 한 번만 저장되는 값이라 contract_hash와 같은 신뢰
 * 경계를 쓴다.
 */
export async function computeRuleHash(params: {
  ruleVersion: number;
  theaterBps: number;
  distributorBps: number;
  distributionFeeBps: number;
  investorProfitBps: number;
}): Promise<string> {
  const preimage = [
    params.ruleVersion,
    params.theaterBps,
    params.distributorBps,
    params.distributionFeeBps,
    params.investorProfitBps,
  ].join("|");
  return sha256Hex(new TextEncoder().encode(preimage).buffer);
}
