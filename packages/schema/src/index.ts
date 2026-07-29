/**
 * [팀 공용 인터페이스] 이 파일이 4인 병렬 개발의 계약서다.
 *
 * 협업 규칙(실행계획서 §2-3): 여기 정의를 먼저 커밋·합의한 뒤 각자 개발한다.
 * 이 파일의 변경은 전원 리뷰 대상(전역 결정 G6).
 *
 *   A(프론트) ── SettlementRule 로 STAGE 0 승인 UI를 그리고
 *   B·C(체인) ── 같은 필드를 Anchor state(programs/movie_escrow/src/state.rs)에 대응시키고
 *   D(에이전트) ── VerificationResult · JudgeDecision 으로 STAGE 3~4를 만든다.
 */

// ── STAGE 0: 정산 규칙 JSON (Gemini 추출 → 양측 승인 → vN 확정) ──────────────

/** 계약서에서 추출한 개별 항목 + 근거. Gemini Structured Output 스키마와 1:1. */
export interface ExtractedClause {
  /** 예: "부율", "배급수수료", "MG", "정산일", "할인 처리" */
  field: string;
  value: string | number;
  /** 근거 조항 번호 (예: "제5조 2항") */
  sourceClause: string;
  /** 근거 원문 인용 */
  sourceText: string;
  /** 추출 신뢰도 0~1 */
  confidence: number;
}

/** 항목 간 충돌 (예: 본문 45일 지급 vs 별지 30일 지급) */
export interface RuleConflict {
  fields: string[];
  description: string;
  resolved: boolean;
}

/** 양측 승인을 거쳐 확정된 정산 규칙. 해시가 온체인(init_escrow)에 등록된다. */
export interface SettlementRule {
  version: number;
  movieTitle: string;
  /** 부율 — 예: 서울 한국영화 5:5 */
  revenueShare: { theater: number; distributor: number };
  /** 배급수수료율 (예: 0.10) */
  distributionFeeRate: number;
  /** MG(미니멈 개런티) — 소액 권장, 없으면 null */
  minimumGuarantee: number | null;
  /** 정산일 (회차 종료 후 n일) */
  settlementDays: number;
  /** 무료 발권 상한 비율 (예: 0.05) — STAGE 3 P3 검증과 숫자 일치 필수 */
  freeTicketCapRate: number;
  clauses: ExtractedClause[];
  conflicts: RuleConflict[];
  approvals: { distributor: boolean; theater: boolean };
  /** 승인 완료 후 계산된 규칙 해시(hex). 온체인 rule_hash와 일치해야 한다 */
  ruleHash: string | null;
}

// ── STAGE 1: 발권·환불 로그 (S3 위험조정검증의 원천 데이터) ──────────────────

export type TicketEventKind = "issue" | "refund";

export interface TicketEvent {
  kind: TicketEventKind;
  screeningId: string;
  seat: string;
  /** USDC 최소 단위(6 decimals) 정수 */
  amount: number;
  /** unix ms */
  timestamp: number;
  /** 입금/환불 트랜잭션 서명 (Explorer 링크용) */
  txSignature: string;
  /** 직전 이벤트 해시 — P5 해시 연속성 검증용 */
  prevHash: string;
}

/** 회차 메타 (STAGE 4 판단 입력) */
export interface ScreeningMeta {
  screeningId: string;
  seatCount: number;
  averageOccupancy: number;
  historicalRefundRate: number;
}

// ── STAGE 3: 위험조정검증 (D) ────────────────────────────────────────────────

/** 같은 상영관의 과거 정산 이력 집계 (온체인 RPC 조회 결과) */
export interface OnchainHistorySummary {
  theater: string;
  settledBatchCount: number;
  totalSettledAmount: number;
  anomalyCount: number;
  disputeCount: number;
  /** 이력이 전혀 없으면 true → 보수적 임계값 적용 */
  isNew: boolean;
}

/** 이력 기반으로 조정된 이상탐지 임계값 */
export interface AdjustedThresholds {
  /** P3: 환불률 상한 (기본 0.10) */
  maxRefundRate: number;
  /** P3: 무료 발권 비율 상한 (기본 0.15) */
  maxFreeRate: number;
  /** P4: 발권수 상한 = 좌석수 */
  maxTicketsPerScreening: number;
}

export type CheckId =
  | "refund-rate" // P3 환불률
  | "free-rate" // P3 무료 비율
  | "over-issue" // P4 발권수 > 좌석수
  | "hash-chain"; // P5 해시 연속성

export interface CheckResult {
  check: CheckId;
  passed: boolean;
  /** 측정값 vs 임계값 — 대시보드·판정 근거에 그대로 노출 */
  observed: number | string;
  threshold: number | string;
}

export interface VerificationResult {
  screeningId: string;
  thresholds: AdjustedThresholds;
  checks: CheckResult[];
  /** 전 항목 통과 여부 */
  allPassed: boolean;
}

/** Phase 2 훅 공통 반환형 — Phase 1에서는 항상 { needed: false } */
export interface Phase2HookResult {
  needed: boolean;
  /** Phase 2에서 x402 조회를 수행한 경우의 결과 요약 */
  detail?: string;
}

// ── STAGE 4: 정산 실행 판단 (D + A 프롬프트) ─────────────────────────────────

export type Verdict = "proceed" | "partial-hold";

export interface JudgeDecision {
  screeningId: string;
  verdict: Verdict;
  /** 보류 금액 (verdict가 partial-hold일 때) */
  heldAmount: number;
  /** 근거 조항 (예: "제5조 무료 발권 상한 5% 대비 18% 발권") */
  basisClauses: string[];
  /** Gemini가 생성한 자연어 근거 — 대시보드에 그대로 노출 (룰베이스로 보이면 감점) */
  narrative: string;
  /** unix ms */
  decidedAt: number;
}

// ── STAGE 6: 대시보드 조회 응답 (D → A) ──────────────────────────────────────

/** 에스크로 상태머신 — Anchor state와 명칭 일치 필수 (B·C 합의) */
export type EscrowStatus =
  "pending" | "verified" | "allocated" | "paid" | "disputed";

export interface BeneficiaryBalance {
  role: "theater" | "distributor" | "producer" | "investor";
  address: string;
  claimable: number;
  claimed: number;
}

export interface TimelineEntry {
  label: string;
  txSignature: string;
  timestamp: number;
}

export interface DashboardSnapshot {
  status: EscrowStatus;
  grossIn: number;
  pending: number;
  allocated: number;
  disputed: number;
  paidOut: number;
  /** 관객 환불 누계 — 불변식 검산에 필요: gross = pending+allocated+disputed+paid+refunded */
  refunded: number;
  balances: BeneficiaryBalance[];
  timeline: TimelineEntry[];
  decisions: JudgeDecision[];
}
