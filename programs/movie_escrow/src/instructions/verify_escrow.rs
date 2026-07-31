//! [B] STAGE 3→2 게이트: D의 위험조정검증 통과를 온체인에 기록.
//!
//! Pending → Verified 전환만 담당한다. settle_batch는 guards::require_state로
//! Verified 상태만 받아들이도록 가드해서, STAGE 3 검증 없이 정산이 실행되는
//! 걸 온체인에서 막는다.

use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::guards::require_state;
use crate::state::{EscrowState, MovieEscrow};

#[derive(Accounts)]
pub struct VerifyEscrow<'info> {
    /// 정산 에이전트 — escrow.authority와 일치해야 함.
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.movie_id.as_bytes()],
        bump = escrow.bump,
        has_one = authority @ EscrowError::InvalidState,
    )]
    pub escrow: Account<'info, MovieEscrow>,
}

/// STAGE 3 검증 통과 이벤트 — D의 온체인 이력 조회 대상.
#[event]
pub struct VerifiedEvent {
    pub escrow: Pubkey,
    pub movie_id: String,
    pub timestamp: i64,
}

pub fn handler(ctx: Context<VerifyEscrow>) -> Result<()> {
    require_state(&ctx.accounts.escrow, EscrowState::Pending)?;

    let escrow = &mut ctx.accounts.escrow;
    escrow.state = EscrowState::Verified;

    emit!(VerifiedEvent {
        escrow: escrow.key(),
        movie_id: escrow.movie_id.clone(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
