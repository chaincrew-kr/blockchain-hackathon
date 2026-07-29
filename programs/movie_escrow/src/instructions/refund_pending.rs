//! [B] STAGE 1: Pending 자금의 유일한 출구 — 관객 환불 (격리 불변식 ③).

use anchor_lang::prelude::*;

use crate::error::EscrowError;

#[derive(Accounts)]
pub struct RefundPending<'info> {
    // TODO(B): escrow vault → 관객 토큰 계정 반환. 관객 본인 외 수취 불가 검증
    pub authority: Signer<'info>,
}

pub fn handler(_ctx: Context<RefundPending>, _amount: u64) -> Result<()> {
    // TODO(B): pending −= amount, refunded += amount, 환불 이벤트 emit
    err!(EscrowError::NotImplemented)
}
