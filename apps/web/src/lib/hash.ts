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

/**
 * init_escrow에 등록할 rule_hash 계산 (SCHEMA_CONTRACT §11, A·B·D 합의).
 *
 * SettlementRule 전체가 아니라 settle_batch가 실제로 받는 온체인 숫자
 * (rule_version, *_bps 3개)만 해시 대상으로 삼는다 — 조항 원문·충돌·승인
 * 여부 등은 온체인 인자로 넘어가지 않으므로 검증 자체가 불가능하다.
 * 인코딩은 apps/agent/src/risk-check/hash.ts의 TicketEvent 해시체인과 동일한
 * "필드를 '|'로 join 후 sha256" 방식 — programs/movie_escrow의
 * settle_batch.rs와 바이트 단위로 일치해야 한다.
 *
 * theaterBps/distributorBps/distributionFeeBps는 SettlementRule의
 * revenueShare/distributionFeeRate(0~1 소수)를 settle_batch에 넘길 때와
 * 동일한 방식으로 basis point(정수, ×10000)로 변환한 값이어야 한다.
 */
export async function computeRuleHash(params: {
  ruleVersion: number;
  theaterBps: number;
  distributorBps: number;
  distributionFeeBps: number;
}): Promise<string> {
  const preimage = [
    params.ruleVersion,
    params.theaterBps,
    params.distributorBps,
    params.distributionFeeBps,
  ].join("|");
  return sha256Hex(new TextEncoder().encode(preimage).buffer);
}
