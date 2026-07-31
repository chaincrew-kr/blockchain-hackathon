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

/**
 * 데모용 가상 계약서 조항 — A가 실제로 작성한 데모 계약서
 * (영화_상영계약서_무충돌_버전.pdf, CONTRACT-DEMO-002) 기준으로 맞춤.
 *
 * ⚠️ 이전 버전은 PLAN 문서의 예시 문구("제5조 무료 발권 상한")를 그대로
 * 가져다 썼는데, 실제 계약서는 그 번호로 안 쓰여있었다 (이슈 #15 B-6).
 * 아래는 실제 계약서 조항과 대조해 맞춘 값 — 계약서 문구가 바뀌면 이것도
 * 같이 바꿔야 한다.
 */
export const DEMO_CONTRACT_TERMS: ContractTerms = {
  // 제10조①: "무료입장객이 차지하는 비율이 5%를 초과할 수 없다"
  freeTicket: { article: "제10조①(무료입장)", cap: 0.05 },
  // 제13조④: "환불률이 10%를 초과하는 경우... 정산 지급을 보류한다"
  refund: { article: "제13조④(환불 처리 기준)", cap: 0.1 },
  // 계약서에 좌석수 상한을 명시한 별도 조항이 없음 — 제4조(계약 기본사항)에
  // 회차별 정보가 있으나 "발권 ≤ 좌석수"는 계약 조항이 아니라 물리적 제약.
  // cap을 null로 유지하고 article은 참고용으로만 표시.
  seating: {
    article: "제4조(계약 기본사항 — 상영관 좌석수 40석)",
    cap: null,
  },
  // 제6조②: "상영자는... 입장수입과 입장객 수를 나타내는 정확한 기록을 유지하여야 한다"
  record: { article: "제6조②(상영권료의 산정비율)", cap: null },
};
