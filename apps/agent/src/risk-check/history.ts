/**
 * 상영관 과거 정산 이력 조회 — provider 추상화.
 *
 * B·C의 계정 구조(state.rs)·IDL이 확정되기 전에도 파이프라인을 완주시키기 위해
 * 조회를 인터페이스 뒤로 숨긴다. 체인 연결 시 RpcHistoryProvider만 채우면 되고,
 * 데모·테스트는 FixtureHistoryProvider를 쓴다.
 */
import type { OnchainHistorySummary } from "@chaincrew/schema";

export interface HistoryProvider {
  fetchTheaterHistory(theater: string): Promise<OnchainHistorySummary>;
}

/** 데모·테스트용 — 주입한 이력을 그대로 돌려준다. 기본값은 "이력 없는 신규 상영관". */
export class FixtureHistoryProvider implements HistoryProvider {
  constructor(
    private readonly summaries: Record<string, OnchainHistorySummary> = {},
  ) {}

  async fetchTheaterHistory(theater: string): Promise<OnchainHistorySummary> {
    return (
      this.summaries[theater] ?? {
        theater,
        settledBatchCount: 0,
        totalSettledAmount: 0,
        anomalyCount: 0,
        disputeCount: 0,
        isNew: true,
      }
    );
  }
}

/**
 * 실제 온체인 조회 — B·C의 MovieEscrow/Allocation 필드 확정 + IDL 커밋 후 구현.
 * getProgramAccounts로 같은 상영관의 과거 배치 기록을 집계한다.
 */
export class RpcHistoryProvider implements HistoryProvider {
  constructor(private readonly rpcUrl: string) {}

  async fetchTheaterHistory(theater: string): Promise<OnchainHistorySummary> {
    // TODO(D, 체인 연결 후): getProgramAccounts(programId, memcmp: theater) → 집계
    void this.rpcUrl;
    throw new Error(
      `RpcHistoryProvider 미구현 — IDL 확정 전에는 FixtureHistoryProvider를 쓸 것 (theater=${theater})`,
    );
  }
}
