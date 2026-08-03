/**
 * 데모 픽스처 — 체인(B·C)·구매웹(A) 없이 STAGE 3→4 파이프라인을 완주시키는 데이터.
 *
 * - normal:  정상 회차. 전 검증 통과 → "진행" 판정.
 * - anomalous: 무료 발권 상한 초과 회차(실행계획서 STAGE 4 권장 시나리오
 *   "제5조 무료 발권 상한 대비 초과 발권") → "부분 보류" 판정.
 *
 * A(대시보드·구매웹)·B·C(Anchor 테스트)도 이 픽스처를 공용으로 쓴다.
 * 실데이터 연결 시 pipeline의 EventSource만 교체하면 된다.
 */
import type { ScreeningMeta, TicketEvent } from "@chaincrew/schema";

import type { SettleWaterfallParams } from "../chain/gateway.js";
import { GENESIS_HASH, hashTicketEvent } from "../risk-check/hash.js";

/** USDC 6 decimals — 10 USDC */
export const TICKET_PRICE = 10_000_000;

/** init_escrow에 등록하는 데모 영화 식별자 — 에스크로 PDA 시드와 일치해야 한다. */
export const DEMO_MOVIE_ID = "MOV-INDIE-2026";

/**
 * 데모 워터폴 인자 — 서울 한국영화 부율 5:5, 배급수수료 10%.
 *
 * 승인된 SettlementRule vN의 revenueShare·distributionFeeRate와 같은 값이어야
 * 한다. rule_hash 인코딩 방식이 합의되면(SCHEMA_CONTRACT §11) 상수 대신 rule
 * 객체에서 파생한다.
 */
export const demoSettlement: SettleWaterfallParams = {
  movieId: DEMO_MOVIE_ID,
  theaterBps: 5000,
  distributorBps: 5000,
  distributionFeeBps: 1000,
};

/** 데모 기준 시각(unix ms) — 2026-07-30 14:00 KST 회차 */
const BASE_TS = 1_785_992_400_000;

interface EventSeed {
  kind: TicketEvent["kind"];
  seat: string;
  amount: number;
}

/** prevHash를 자동으로 이어 붙여 유효한 해시체인을 만든다. */
export function buildEventChain(
  screeningId: string,
  seeds: EventSeed[],
  baseTimestamp = BASE_TS,
): TicketEvent[] {
  const events: TicketEvent[] = [];
  let prevHash = GENESIS_HASH;
  seeds.forEach((seed, index) => {
    const event: TicketEvent = {
      kind: seed.kind,
      screeningId,
      seat: seed.seat,
      amount: seed.amount,
      timestamp: baseTimestamp + index * 30_000,
      txSignature: `FIXTURE_TX_${screeningId}_${index}`,
      prevHash,
    };
    events.push(event);
    prevHash = hashTicketEvent(event);
  });
  return events;
}

function seats(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
}

// ── 정상 회차: 유료 19 + 무료 1(5%) 발권, 환불 1건(5%) ────────────────────────
// 환불률 1/20=5% < 10%, 무료율 1/20=5% < 15%, 발권 20 ≤ 좌석 50, 해시체인 정상.

export const NORMAL_SCREENING_ID = "SCR-2026-0730-14";

export const normalMeta: ScreeningMeta = {
  screeningId: NORMAL_SCREENING_ID,
  seatCount: 50,
  averageOccupancy: 0.42,
  historicalRefundRate: 0.04,
};

export const normalEvents: TicketEvent[] = buildEventChain(
  NORMAL_SCREENING_ID,
  [
    ...seats("A", 19).map((seat) => ({
      kind: "issue" as const,
      seat,
      amount: TICKET_PRICE,
    })),
    { kind: "issue" as const, seat: "B1", amount: 0 }, // 무료 초대권 1매
    { kind: "refund" as const, seat: "A7", amount: TICKET_PRICE },
  ],
);

// ── 이상 회차: 무료 발권 2/11 ≈ 18.2% — 상한 초과 → 부분 보류 ────────────────

export const ANOMALOUS_SCREENING_ID = "SCR-2026-0730-23";

export const anomalousMeta: ScreeningMeta = {
  screeningId: ANOMALOUS_SCREENING_ID,
  seatCount: 50,
  averageOccupancy: 0.12,
  historicalRefundRate: 0.04,
};

export const anomalousEvents: TicketEvent[] = buildEventChain(
  ANOMALOUS_SCREENING_ID,
  [
    ...seats("C", 9).map((seat) => ({
      kind: "issue" as const,
      seat,
      amount: TICKET_PRICE,
    })),
    { kind: "issue" as const, seat: "D1", amount: 0 },
    { kind: "issue" as const, seat: "D2", amount: 0 },
  ],
  BASE_TS + 9 * 3_600_000, // 심야 회차
);

/** 데모 배치 = 회차 2개 (정상 1 + 이상 1) */
export const demoBatch = [
  { meta: normalMeta, events: normalEvents },
  { meta: anomalousMeta, events: anomalousEvents },
] as const;

export const DEMO_THEATER = "THEATER-INDIE-001";
