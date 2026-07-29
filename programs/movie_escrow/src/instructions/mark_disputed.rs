//! [C] STAGE 4→5: 보류 판정분 Disputed 격리.

use anchor_lang::prelude::*;

use crate::error::EscrowError;

#[derive(Accounts)]
pub struct MarkDisputed<'info> {
    // TODO(C): authority(에이전트) 검증 + MovieEscrow
    pub authority: Signer<'info>,
}

pub fn handler(_ctx: Context<MarkDisputed>, _amount: u64) -> Result<()> {
    // TODO(C): pending(또는 allocated) → disputed 이동, 판정 근거 이벤트 emit
    err!(EscrowError::NotImplemented)
}
