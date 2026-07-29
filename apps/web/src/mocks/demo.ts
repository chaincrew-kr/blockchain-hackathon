/**
 * 목업 데이터 — 전부 @chaincrew/schema 타입으로 작성해 화면과 데이터 계약을
 * 미리 맞춘다. 실제 연동 시 이 파일을 apps/agent API·온체인 조회로 교체.
 *
 * 시나리오(실행계획서 권장안): 무료초대권 비율 초과 → 해당 회차 부분 보류.
 * 금액 불변식: gross 180 = pending 0 + allocated 118.6 + disputed 32.7
 *              + paid 8.7 + refunded 20.
 */
import type {
  CheckResult,
  DashboardSnapshot,
  ExtractedClause,
  JudgeDecision,
  RuleConflict,
} from "@chaincrew/schema";

import type { BarDatum } from "../components/BarChart";

// ── S0 백오피스 ──────────────────────────────────────────────────────
export const extractedClauses: (ExtractedClause & { conflict?: boolean })[] = [
  {
    field: "부율 (서울·한국영화)",
    value: "50 : 50",
    sourceClause: "제4조 1항",
    sourceText: "…극장과 배급사는 순매출을 5:5로 배분한다",
    confidence: 0.97,
  },
  {
    field: "배급수수료",
    value: "10%",
    sourceClause: "제6조",
    sourceText: "배급사는 배급수수료로 순매출의 10%를…",
    confidence: 0.95,
  },
  {
    field: "MG (미니멈 개런티)",
    value: "5,000 USDC",
    sourceClause: "제7조 2항",
    sourceText: "배급사는 제작사에 최소 보장액을 선지급하며…",
    confidence: 0.88,
  },
  {
    field: "무료 발권 상한",
    value: "5%",
    sourceClause: "제5조 2항",
    sourceText: "초대권 등 무료 발권은 총 발권의 5%를 넘지 못한다",
    confidence: 0.93,
  },
  {
    field: "정산일 ⚠",
    value: "45일 vs 30일",
    sourceClause: "제9조 ↔ 별지 2",
    sourceText:
      '본문 제9조 "종영 후 45일 이내" ↔ 별지 2 "매월 말 기준 30일 이내" — 상호 불일치. 승인 전 해결 필요.',
    confidence: 0.41,
    conflict: true,
  },
];

export const ruleConflicts: RuleConflict[] = [
  {
    fields: ["정산일"],
    description: "본문 45일 지급 vs 별지 30일 지급 — 정산일 상호 불일치",
    resolved: false,
  },
];

// ── S6 대시보드 ──────────────────────────────────────────────────────
export const snapshot: DashboardSnapshot = {
  status: "allocated",
  grossIn: 180.0,
  pending: 0.0,
  allocated: 118.6,
  disputed: 32.7,
  paidOut: 8.7,
  refunded: 20.0,
  balances: [
    {
      role: "theater",
      address: "9dQx…mm2A",
      claimable: 43.2,
      claimed: 8.7,
    },
    {
      role: "distributor",
      address: "4kFe…pR8s",
      claimable: 36.9,
      claimed: 0,
    },
    { role: "producer", address: "7wBn…tV3q", claimable: 26.4, claimed: 0 },
    { role: "investor", address: "2mHj…zK5c", claimable: 12.1, claimed: 0 },
  ],
  timeline: [
    {
      label: "deposit — 관객 결제 10.0 USDC",
      txSignature: "5Kd2…vXq9",
      timestamp: Date.parse("2026-07-31T19:31:00+09:00"),
    },
    {
      label: "refund_pending — 관객 환불 10.0 USDC",
      txSignature: "8Rw1…mA4d",
      timestamp: Date.parse("2026-07-31T20:14:00+09:00"),
    },
    {
      label: "settle_batch — 배치 #3 귀속 · 규칙 v1",
      txSignature: "2Fh8…kQ7c",
      timestamp: Date.parse("2026-07-31T21:04:00+09:00"),
    },
    {
      label: "mark_disputed — 32.7 USDC 격리",
      txSignature: "9Xc3…bT2e",
      timestamp: Date.parse("2026-07-31T21:04:00+09:00"),
    },
    {
      label: "⚠ claim 151.3 USDC — 온체인 거부",
      txSignature: "ExceedsClaimable — 상영자 지갑이 전액 인출 시도",
      timestamp: Date.parse("2026-07-31T21:22:00+09:00"),
    },
    {
      label: "claim — 극장 8.7 USDC 인출",
      txSignature: "4Jm6…pW9a",
      timestamp: Date.parse("2026-07-31T21:25:00+09:00"),
    },
  ],
  decisions: [],
};

export const checks: CheckResult[] = [
  { check: "refund-rate", passed: true, observed: "9.1%", threshold: "10.0%" },
  { check: "over-issue", passed: true, observed: 22, threshold: 60 },
  { check: "free-rate", passed: false, observed: "18.2%", threshold: "5.0%" },
  { check: "hash-chain", passed: true, observed: "22/22", threshold: "연속" },
];

export const decision: JudgeDecision = {
  screeningId: "#12",
  verdict: "partial-hold",
  heldAmount: 32.7,
  basisClauses: ["제5조 2항 — 무료 발권 상한 5%"],
  narrative:
    "이번 회차의 무료 발권 비율은 18.2%로, 계약 제5조 2항이 정한 상한 5%를 크게 웃돕니다. 무료 발권은 유효매출에서 제외되므로, 이 비율이 확정되기 전에 정산하면 배급·제작·투자 몫의 베이스 금액 자체가 흔들립니다. 해당 회차 몫 32.7 USDC만 보류로 격리하고, 나머지 회차는 정상 정산을 진행합니다.",
  decidedAt: Date.parse("2026-07-31T21:04:00+09:00"),
};

export const demoDaily: BarDatum[] = [
  { d: "7/25", v: 1 },
  { d: "7/26", v: 2 },
  { d: "7/27", v: 4 },
  { d: "7/28", v: 3 },
  { d: "7/29", v: 5 },
  { d: "7/30", v: 4 },
  { d: "7/31", v: 3 },
];

export const kobisDaily: BarDatum[] = [
  { d: "7/25", v: 312 },
  { d: "7/26", v: 428 },
  { d: "7/27", v: 391 },
  { d: "7/28", v: 502 },
  { d: "7/29", v: 467 },
  { d: "7/30", v: 389 },
  { d: "7/31", v: 538 },
];
