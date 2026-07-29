//! [B] STAGE 1: 관객 결제 입금 — 수취 주소가 곧 에스크로 (경유 계좌 0개).

use anchor_lang::prelude::*;

use crate::error::EscrowError;

#[derive(Accounts)]
pub struct Deposit<'info> {
    // TODO(B): 관객 토큰 계정 → escrow vault 이체, MovieEscrow.pending 갱신
    pub payer: Signer<'info>,
}

pub fn handler(_ctx: Context<Deposit>, _amount: u64) -> Result<()> {
    // TODO(B): gross_in += amount, pending += amount, 발권 이벤트 emit
    err!(EscrowError::NotImplemented)
}
