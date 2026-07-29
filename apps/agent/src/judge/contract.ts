/**
 * 판정 근거로 인용할 계약 조항 — SPEC-INDIE-002 §5 규칙 JSON 기준.
 *
 * **계약 상한과 보류 임계는 다른 층위다.**
 *
 *   계약 상한 초과 (예: 무료 발권 5%)  → 계약 위반
 *   보류 임계 초과 (예: 무료 발권 15%) → 자금 격리
 *
 * SPEC이 `compTicketCap`(0.05)과 `disputeThresholds.freeTicketRate`(0.15)를
 * 같은 규칙 JSON 안에 나눠 둔 이유가 이것이다 — 계약 위반이라고 곧바로 돈을
 * 묶으면 과하므로 완충을 뒀다. 판정 근거 문구는 두 층위를 모두 드러내야
 * 심사위원이 계약서와 화면을 나란히 봐도 어긋나지 않는다.
 *
 * TODO(A): 가상 계약서 확정 후 SettlementRule에서 읽어오도록 교체.
 *          조항 번호는 제5조만 실행계획서에 근거가 있고 나머지는 임의 배치다
 *          (이슈 #15 B-6).
 */

export interface ContractClause {
  /** 조항 번호·제목 — 판정 근거 문구에 그대로 인용된다 */
  article: string;
  /** 계약상 상한. 해당 조항에 수치 상한이 없으면 null */
  cap: number | null;
}

export interface ContractTerms {
  freeTicket: ContractClause;
  refund: ContractClause;
  seating: ContractClause;
  record: ContractClause;
}

/** 데모용 가상 계약서 조항 — A의 계약서가 확정되면 교체한다. */
export const DEMO_CONTRACT_TERMS: ContractTerms = {
  // SPEC §5 compTicketCap: 0.05
  freeTicket: { article: "제5조(무료 발권 상한)", cap: 0.05 },
  // 계약서에 환불률 수치 상한 조항은 없다 — 보류 임계로만 판단한다.
  refund: { article: "제7조(환불 처리)", cap: null },
  seating: { article: "제4조(발권 관리)", cap: null },
  record: { article: "제9조(기록 보존)", cap: null },
};
