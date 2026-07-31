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
