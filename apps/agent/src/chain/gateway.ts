/**
 * 체인 호출 게이트웨이 — B(settle_batch)·C(mark_disputed) instruction 어댑터.
 *
 * IDL이 packages/schema/idl에 커밋되면 AnchorChainGateway를 구현해 교체한다.
 * 그 전에는 StubChainGateway로 파이프라인을 완주시킨다 (호출 사실만 기록).
 */

export interface SettleBatchResult {
  txSignature: string;
  /** 한 회차에서 settle + 권리자별 보류처럼 여러 트랜잭션이 발생할 수 있다. */
  txSignatures?: string[];
}

export interface ChainGateway {
  /** B의 settle_batch — "진행" 판정분 귀속 확정 */
  settleBatch(screeningId: string, amount: number): Promise<SettleBatchResult>;
  /** C의 mark_disputed — 보류분 Disputed 격리 */
  markDisputed(screeningId: string, amount: number): Promise<SettleBatchResult>;
}

/** 체인 미연결 개발·데모용 — 가짜 tx 서명을 돌려준다. */
export class StubChainGateway implements ChainGateway {
  readonly calls: Array<{
    instruction: "settle_batch" | "mark_disputed";
    screeningId: string;
    amount: number;
  }> = [];

  async settleBatch(
    screeningId: string,
    amount: number,
  ): Promise<SettleBatchResult> {
    this.calls.push({ instruction: "settle_batch", screeningId, amount });
    return { txSignature: `STUB_SETTLE_${screeningId}` };
  }

  async markDisputed(
    screeningId: string,
    amount: number,
  ): Promise<SettleBatchResult> {
    this.calls.push({ instruction: "mark_disputed", screeningId, amount });
    return { txSignature: `STUB_DISPUTE_${screeningId}` };
  }
}

// TODO(D, B·C IDL 커밋 후): AnchorChainGateway — @coral-xyz/anchor로
// settle_batch / mark_disputed 트랜잭션을 실제 전송 (에이전트 authority 서명).
