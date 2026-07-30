//! [C] STAGE 5: 권리자 인출 — 자기 몫만, 남은 만큼만.
//!
//! 인출 제한 불변식 ②: claim 금액 ≤ claimable − claimed − disputed
//! 봉투 이동: escrow.allocated → escrow.paid_out

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::state::{Allocation, EscrowState, MovieEscrow};

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.movie_id.as_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, MovieEscrow>,

    /// 이 escrow에 속한 권리자 장부 — 주인 일치는 handler에서 검사.
    #[account(
        mut,
        has_one = escrow,
        has_one = beneficiary @ EscrowError::Unauthorized,
    )]
    pub allocation: Account<'info, Allocation>,

    /// 권리자의 USDC 계정 — vault에서 여기로 이체된다.
    #[account(
        mut,
        associated_token::mint = escrow.usdc_mint,
        associated_token::authority = beneficiary,
    )]
    pub beneficiary_token_account: Account<'info, TokenAccount>,

    #[account(mut, address = escrow.vault)]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/// STAGE 5 인출 이벤트 — D의 온체인 이력 조회 대상.
#[event]
pub struct ClaimEvent {
    pub escrow: Pubkey,
    pub movie_id: String,
    pub beneficiary: Pubkey,
    pub amount: u64,
    pub claimed: u64,
    pub allocated: u64,
    pub paid_out: u64,
    pub timestamp: i64,
}

pub fn handler(ctx: Context<Claim>, amount: u64) -> Result<()> {
    require!(amount > 0, EscrowError::InvalidState);

    require!(
        ctx.accounts.escrow.state == EscrowState::Allocated
            || ctx.accounts.escrow.state == EscrowState::Disputed,
        EscrowError::InvalidState
    );

    let remaining = ctx
        .accounts
        .allocation
        .claimable
        .checked_sub(ctx.accounts.allocation.claimed)
        .ok_or(EscrowError::MathOverflow)?
        .checked_sub(ctx.accounts.allocation.disputed)
        .ok_or(EscrowError::MathOverflow)?;
    require!(amount <= remaining, EscrowError::ExceedsClaimable);

    require!(
        amount <= ctx.accounts.escrow.allocated,
        EscrowError::InvalidState
    );

    let beneficiary_key = ctx.accounts.beneficiary.key();
    let movie_id = ctx.accounts.escrow.movie_id.clone();
    let bump = ctx.accounts.escrow.bump;
    let seeds: &[&[u8]] = &[b"escrow", movie_id.as_bytes(), &[bump]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.beneficiary_token_account.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;

    let allocation = &mut ctx.accounts.allocation;
    allocation.claimed = allocation
        .claimed
        .checked_add(amount)
        .ok_or(EscrowError::MathOverflow)?;
    let claimed_now = allocation.claimed;

    let escrow = &mut ctx.accounts.escrow;
    escrow.allocated = escrow
        .allocated
        .checked_sub(amount)
        .ok_or(EscrowError::MathOverflow)?;
    escrow.paid_out = escrow
        .paid_out
        .checked_add(amount)
        .ok_or(EscrowError::MathOverflow)?;

    emit!(ClaimEvent {
        escrow: escrow.key(),
        movie_id: escrow.movie_id.clone(),
        beneficiary: beneficiary_key,
        amount,
        claimed: claimed_now,
        allocated: escrow.allocated,
        paid_out: escrow.paid_out,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}