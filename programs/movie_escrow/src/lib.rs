//! [담당: B·C] S6 영화 정산 에스크로 — 단일 Anchor 프로그램.
//!
//! B(자금흐름): init_escrow · deposit · refund_pending · settle_batch
//! C(판정집행): claim · mark_disputed · resolve_dispute
//!
//! ⚠️ 계정 구조(state.rs)는 B·C가 7/29 중 함께 확정한 뒤 각자 instruction을
//!    작성한다 (실행계획서 §2 협업 규칙 2). 빌드 후 IDL은 packages/schema/idl로
//!    복사해 A·D와 공유한다.

use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod movie_escrow {
    use super::*;

    // ── B 자금흐름 ──────────────────────────────────────────────────────

    /// STAGE 0b: 승인된 정산 규칙 해시를 등록하며 에스크로 초기화.
    pub fn init_escrow(
        ctx: Context<InitEscrow>,
        rule_hash: [u8; 32],
        rule_version: u16,
    ) -> Result<()> {
        instructions::init_escrow::handler(ctx, rule_hash, rule_version)
    }

    /// STAGE 1: 관객 결제 → 에스크로 PDA 입금 (상태 Pending).
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    /// STAGE 1: Pending 자금의 유일한 출구 — 관객 환불 (격리 불변식 ③).
    pub fn refund_pending(ctx: Context<RefundPending>, amount: u64) -> Result<()> {
        instructions::refund_pending::handler(ctx, amount)
    }

    /// STAGE 2: 공제 워터폴 실행 후 권리자별 Allocation 확정.
    pub fn settle_batch(ctx: Context<SettleBatch>) -> Result<()> {
        instructions::settle_batch::handler(ctx)
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
