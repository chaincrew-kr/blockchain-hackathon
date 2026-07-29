//! [B] STAGE 2: 공제 워터폴 → 권리자별 Allocation 확정.
//!
//! 순서: 부과금(가액÷1.03×3%, 반올림) → VAT(잔액÷11) → 부율 분할
//!       → 배급수수료 → MG 상환(잔액 추적) → 투자 상환 → 이익 배분
//! 전부 u64 정수 연산 — 반올림 산식은 사전 검증 필수 (실행계획서 STAGE 2).

use anchor_lang::prelude::*;

use crate::error::EscrowError;

#[derive(Accounts)]
pub struct SettleBatch<'info> {
    // TODO(B): MovieEscrow + 권리자별 Allocation PDA들, authority(에이전트) 검증
    pub authority: Signer<'info>,
}

pub fn handler(_ctx: Context<SettleBatch>) -> Result<()> {
    // TODO(B): 워터폴 계산 → Allocation.claimable 기록, pending → allocated 이동
    // 불변식 ①: gross_in = pending + allocated + disputed + paid_out + refunded
    err!(EscrowError::NotImplemented)
}
