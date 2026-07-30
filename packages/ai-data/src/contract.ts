/**
 * 판정 근거로 인용할 계약 조항.
 *
 * 계약 상한 초과는 계약 위반이고, 보류 임계 초과는 자금 격리 조건이다.
 * 판정 설명에는 두 층위를 구분해 표시한다.
 */
export interface ContractClause {
  article: string;
  cap: number | null;
}

export interface ContractTerms {
  freeTicket: ContractClause;
  refund: ContractClause;
  seating: ContractClause;
  record: ContractClause;
}

/** 데모용 가상 계약서 조항 — 실제 계약 추출 결과가 확정되면 교체한다. */
export const DEMO_CONTRACT_TERMS: ContractTerms = {
  freeTicket: { article: "제5조(무료 발권 상한)", cap: 0.05 },
  refund: { article: "제7조(환불 처리)", cap: null },
  seating: { article: "제4조(발권 관리)", cap: null },
  record: { article: "제9조(기록 보존)", cap: null },
};
