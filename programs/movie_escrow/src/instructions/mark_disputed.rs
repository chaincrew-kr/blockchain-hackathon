//! [C] STAGE 4→5: 보류 판정분 Disputed 격리.
//!
//! 격리 제한: amount ≤ claimable − claimed − disputed (이미 인출된 몫은 격리 불가)
//! 봉투 이동: escrow.allocated → escrow.disputed

use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::state::{Allocation, EscrowState, MovieEscrow};

#[derive(Accounts)]
pub struct MarkDisputed<'info> {
    /// 정산 에이전트 — escrow.authority와 일치해야 한다.
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.movie_id.as_bytes()],
        bump = escrow.bump,
        has_one = authority @ EscrowError::InvalidState,
    )]
    pub escrow: Account<'info, MovieEscrow>,

    /// 보류 대상 권리자 장부.
    #[account(mut, has_one = escrow)]
    pub allocation: Account<'info, Allocation>,
}

/// STAGE 4 보류 판정 이벤트 — D의 온체인 이력 조회 대상.
#[event]
pub struct MarkDisputedEvent {
    pub escrow: Pubkey,
    pub movie_id: String,
    pub beneficiary: Pubkey,
    pub amount: u64,
    pub allocation_disputed: u64,
    pub escrow_disputed: u64,
    pub timestamp: i64,
}

pub fn handler(ctx: Context<MarkDisputed>, amount: u64) -> Result<()> {
    require!(
        ctx.accounts.escrow.state == EscrowState::Allocated
            || ctx.accounts.escrow.state == EscrowState::Disputed,
        EscrowError::InvalidState
    );
    require!(amount > 0, EscrowError::InvalidState);

    let disputable = ctx
        .accounts
        .allocation
        .claimable
        .checked_sub(ctx.accounts.allocation.claimed)
        .ok_or(EscrowError::MathOverflow)?
        .checked_sub(ctx.accounts.allocation.disputed)
        .ok_or(EscrowError::MathOverflow)?;
    require!(amount <= disputable, EscrowError::ExceedsClaimable);

    let beneficiary = ctx.accounts.allocation.beneficiary;

    let allocation = &mut ctx.accounts.allocation;
    allocation.disputed = allocation
        .disputed
        .checked_add(amount)
        .ok_or(EscrowError::MathOverflow)?;
    let allocation_disputed = allocation.disputed;

    let escrow = &mut ctx.accounts.escrow;
    escrow.allocated = escrow
        .allocated
        .checked_sub(amount)
        .ok_or(EscrowError::MathOverflow)?;
    escrow.disputed = escrow
        .disputed
        .checked_add(amount)
        .ok_or(EscrowError::MathOverflow)?;
    escrow.state = EscrowState::Disputed;

    emit!(MarkDisputedEvent {
        escrow: escrow.key(),
        movie_id: escrow.movie_id.clone(),
        beneficiary,
        amount,
        allocation_disputed,
        escrow_disputed: escrow.disputed,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}