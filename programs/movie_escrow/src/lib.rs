//! [담당: B·C] S6 영화 정산 에스크로 — 단일 Anchor 프로그램.
//!
//! B(자금흐름): init_escrow · deposit · refund_pending · verify_escrow · settle_batch
//! C(판정집행): claim · mark_disputed · resolve_dispute
//!
//! ⚠️ 계정 구조(state.rs)는 B·C가 7/29 중 함께 확정한 뒤 각자 instruction을
//!    작성한다 (실행계획서 §2 협업 규칙 2). 빌드 후 IDL은 packages/schema/idl로
//!    복사해 A·D와 공유한다.

use anchor_lang::prelude::*;

pub mod error;
pub mod guards;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("C65w81oX73ngPa6PjdLR49rsXag9kM1mRD1rPT21NTik");

#[program]
pub mod movie_escrow {
    use super::*;

    // ── B 자금흐름 ──────────────────────────────────────────────────────

    /// STAGE 0b: 승인된 정산 규칙 해시를 등록하며 에스크로 초기화. `theater`는
    /// 이슈 #5(D의 상영관 이력 조회용), `mg_amount`/`investment_amount`는
    /// 이슈 #7 풀 워터폴의 MG·투자 상환 한도 초기값.
    pub fn init_escrow(
        ctx: Context<InitEscrow>,
        movie_id: String,
        theater: Pubkey,
        contract_hash: [u8; 32],
        rule_hash: [u8; 32],
        rule_version: u16,
        mg_amount: u64,
        investment_amount: u64,
    ) -> Result<()> {
        instructions::init_escrow::handler(
            ctx,
            movie_id,
            theater,
            contract_hash,
            rule_hash,
            rule_version,
            mg_amount,
            investment_amount,
        )
    }

    /// STAGE 1: 관객 결제 → 에스크로 PDA 입금 (상태 Pending). `screening_id`/
    /// `seat`는 D의 P5 해시 연속성 검증 원천 데이터 (이슈 #8).
    pub fn deposit(
        ctx: Context<Deposit>,
        screening_id: String,
        seat: String,
        amount: u64,
    ) -> Result<()> {
        instructions::deposit::handler(ctx, screening_id, seat, amount)
    }

    /// STAGE 1: Pending 자금의 유일한 출구 — 관객 환불 (격리 불변식 ③).
    pub fn refund_pending(
        ctx: Context<RefundPending>,
        screening_id: String,
        seat: String,
        amount: u64,
    ) -> Result<()> {
        instructions::refund_pending::handler(ctx, screening_id, seat, amount)
    }

    /// STAGE 3→2 게이트: D의 위험조정검증 통과를 온체인에 기록 (Pending → Verified).
    pub fn verify_escrow(ctx: Context<VerifyEscrow>) -> Result<()> {
        instructions::verify_escrow::handler(ctx)
    }

    /// STAGE 2: 회차(screening) 단위 공제 워터폴 실행 후 권리자별 Allocation에
    /// 누적 확정 (풀 워터폴 — 부과금·VAT·부율 분할·배급수수료·MG 상환·투자
    /// 상환·이익 배분, 이슈 #7). `amount`는 escrow.pending 전체가 아니라
    /// 이번 회차 순매출만 가리킨다 (이슈 #6).
    pub fn settle_batch(
        ctx: Context<SettleBatch>,
        screening_id: String,
        amount: u64,
        theater_bps: u16,
        distributor_bps: u16,
        distribution_fee_bps: u16,
        investor_profit_bps: u16,
    ) -> Result<()> {
        instructions::settle_batch::handler(
            ctx,
            screening_id,
            amount,
            theater_bps,
            distributor_bps,
            distribution_fee_bps,
            investor_profit_bps,
        )
    }

    // ── C 판정집행 ──────────────────────────────────────────────────────

    /// STAGE 5: 권리자 인출 — 자기 Claimable 잔액 초과분은 온체인 거부.
    pub fn claim(ctx: Context<Claim>, amount: u64) -> Result<()> {
        instructions::claim::handler(ctx, amount)
    }

    /// STAGE 4→5: 보류 판정분을 Disputed로 격리.
    pub fn mark_disputed(ctx: Context<MarkDisputed>, amount: u64) -> Result<()> {
        instructions::mark_disputed::handler(ctx, amount)
    }

    /// STAGE 5: 분쟁 해결 — approve면 지급, 아니면 환수.
    pub fn resolve_dispute(ctx: Context<ResolveDispute>, approve: bool) -> Result<()> {
        instructions::resolve_dispute::handler(ctx, approve)
    }
}
