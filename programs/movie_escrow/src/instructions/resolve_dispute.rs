//! [C] STAGE 5: 분쟁 해결 — 보류분 전액을 지급 승인하거나 환수한다.
//!
//! 승인: allocation.disputed → escrow.allocated (다시 claim 가능)
//! 기각: allocation.claimable 삭감 + escrow.refunded 계상 (영구 환수)

use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::state::{Allocation, EscrowState, MovieEscrow};

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    /// 정산 에이전트 — escrow.authority와 일치해야 한다.
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.movie_id.as_bytes()],
        bump = escrow.bump,
        has_one = authority @ EscrowError::InvalidState,
    )]
    pub escrow: Account<'info, MovieEscrow>,

    /// 분쟁 대상 권리자 장부.
    #[account(mut, has_one = escrow)]
    pub allocation: Account<'info, Allocation>,
}

/// STAGE 5 분쟁 해결 이벤트 — D의 온체인 이력 조회 대상.
#[event]
pub struct ResolveDisputeEvent {
    pub escrow: Pubkey,
    pub movie_id: String,
    pub beneficiary: Pubkey,
    pub approve: bool,
    pub amount: u64,
    pub claimable: u64,
    pub escrow_disputed: u64,
    pub timestamp: i64,
}

pub fn handler(ctx: Context<ResolveDispute>, approve: bool) -> Result<()> {
    require!(
        ctx.accounts.escrow.state == EscrowState::Disputed,
        EscrowError::InvalidState
    );

    let amount = ctx.accounts.allocation.disputed;
    require!(amount > 0, EscrowError::InvalidState);

    let beneficiary = ctx.accounts.allocation.beneficiary;

    let allocation = &mut ctx.accounts.allocation;
    allocation.disputed = 0;

    if !approve {
        // 기각 — 이 몫에서 영구 삭감. claimable을 줄이지 않으면
        // disputed가 0이 되면서 다시 인출 가능해진다.
        allocation.claimable = allocation
            .claimable
            .checked_sub(amount)
            .ok_or(EscrowError::MathOverflow)?;
    }
    let claimable_now = allocation.claimable;

    let escrow = &mut ctx.accounts.escrow;
    escrow.disputed = escrow
        .disputed
        .checked_sub(amount)
        .ok_or(EscrowError::MathOverflow)?;

    if approve {
        escrow.allocated = escrow
            .allocated
            .checked_add(amount)
            .ok_or(EscrowError::MathOverflow)?;
    } else {
        // 환수분은 장부상 환불로 계상한다 — 어느 관객에게 돌려줄지는 이
        // 프로그램이 알 수 없으므로 실제 송금 경로는 범위 밖
        // (settle_batch의 부과금·VAT 처리와 동일한 취급).
        escrow.refunded = escrow
            .refunded
            .checked_add(amount)
            .ok_or(EscrowError::MathOverflow)?;
    }

    // 분쟁이 전부 정리되면 정상 상태로 복귀. 다른 권리자의 분쟁이 남아
    // 있으면 Disputed를 유지한다.
    if escrow.disputed == 0 {
        escrow.state = EscrowState::Allocated;
    }

    emit!(ResolveDisputeEvent {
        escrow: escrow.key(),
        movie_id: escrow.movie_id.clone(),
        beneficiary,
        approve,
        amount,
        claimable: claimable_now,
        escrow_disputed: escrow.disputed,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}