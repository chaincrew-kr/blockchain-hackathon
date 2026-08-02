// src/lib/usdc.ts
//
// SCHEMA_CONTRACT.md §2 공통 규칙: API·에이전트·체인은 USDC 최소 단위 정수로
// 주고받는다 (1 USDC = 1_000_000). 화면 표시 변환은 반드시 UI 경계에서만 한다.
//
//   API·에이전트·체인: 32700000
//   화면 표시:         32.7 USDC
//
// D의 /api/snapshot이 실제 연결되면, DashboardPage의 usdc() 함수를
// 이 formatUsdc()로 바꿔치기하면 된다. 지금 mocks/demo.ts는 이미 사람이 읽는
// 소수(180.0 등)로 되어 있어 이 변환이 필요 없지만, 그건 문서 §2가 "웹 목업
// 정리 필요"로 지적한 부분 — 실데이터 연결 시점에 목업도 정수로 맞춰야 함.

const USDC_DECIMALS = 1_000_000;

/** 최소 단위 정수(또는 그 문자열)를 사람이 읽는 소수 문자열로 변환. */
export function formatUsdc(smallestUnit: number | string): string {
  const n =
    typeof smallestUnit === "string" ? Number(smallestUnit) : smallestUnit;
  return (n / USDC_DECIMALS).toFixed(1);
}

/** 반대 방향 — 사람이 입력한 소수(예: PurchasePage 결제 금액)를 최소 단위 정수로. */
export function toUsdcSmallestUnit(displayValue: number): number {
  return Math.round(displayValue * USDC_DECIMALS);
}
