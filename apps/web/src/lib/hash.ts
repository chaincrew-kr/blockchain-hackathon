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

export interface RuleHashInput {
  ruleVersion: number;
  theaterBps: number;
  distributorBps: number;
  distributionFeeBps: number;
}

/**
 * rule_hash 계산 — D·B 확정 인코딩, 온체인과 반드시 동일해야 함:
 *   sha256("{ruleVersion}|{theaterBps}|{distributorBps}|{distributionFeeBps}")
 * bps는 전부 정수 그대로 문자열로 넣는다 (0 패딩 없음 — B·D 확인 완료).
 *
 * ⚠️ 이 함수를 고칠 땐 반드시 B·D한테 먼저 확인하세요 — 온체인 쪽 인코딩과
 * 한 글자라도 다르면 escrow.rule_hash와 안 맞아서 검증이 통과 못 함.
 */
export async function computeRuleHash(input: RuleHashInput): Promise<string> {
  const message = `${input.ruleVersion}|${input.theaterBps}|${input.distributorBps}|${input.distributionFeeBps}`;
  const bytes = new TextEncoder().encode(message);
  return sha256Hex(bytes.buffer as ArrayBuffer);
}
