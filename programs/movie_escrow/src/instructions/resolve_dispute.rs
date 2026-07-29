//! [C] STAGE 5: 분쟁 해결 — approve면 지급, 아니면 환수.
//! 데모에서는 보류까지만 시연, resolve는 대시보드 버튼 존재로 표시 (권장안).

use anchor_lang::prelude::*;

use crate::error::EscrowError;

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    // TODO(C): authority 검증 + MovieEscrow + 대상 Allocation
    pub authority: Signer<'info>,
}

pub fn handler(_ctx: Context<ResolveDispute>, _approve: bool) -> Result<()> {
    // TODO(C): approve → disputed를 claimable로 전환 / 반려 → 환수 경로
    err!(EscrowError::NotImplemented)
}
