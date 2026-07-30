//! [B] STAGE 1: 관객 결제 입금 — 수취 주소가 곧 에스크로 (경유 계좌 0개).

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::state::MovieEscrow;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.movie_id.as_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, MovieEscrow>,

    /// 관객의 USDC 계정 — 여기서 vault로 이체된다.
    #[account(
        mut,
        associated_token::mint = escrow.usdc_mint,
        associated_token::authority = payer,
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    /// escrow가 소유한 vault — 경유 계좌 0개, 수취 주소가 곧 에스크로.
    #[account(mut, address = escrow.vault)]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/// STAGE 1 발권 이벤트 — D의 STAGE 3 위험조정검증이 온체인에서 직접 읽는 원천 데이터.
#[event]
pub struct DepositEvent {
    pub escrow: Pubkey,
    pub movie_id: String,
    pub payer: Pubkey,
    pub amount: u64,
    pub gross_in: u64,
    pub pending: u64,
    pub timestamp: i64,
}

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, EscrowError::InvalidState);

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.payer_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        ),
        amount,
    )?;

    let escrow = &mut ctx.accounts.escrow;
    escrow.gross_in = escrow
        .gross_in
        .checked_add(amount)
        .ok_or(EscrowError::MathOverflow)?;
    escrow.pending = escrow
        .pending
        .checked_add(amount)
        .ok_or(EscrowError::MathOverflow)?;

    emit!(DepositEvent {
        escrow: escrow.key(),
        movie_id: escrow.movie_id.clone(),
        payer: ctx.accounts.payer.key(),
        amount,
        gross_in: escrow.gross_in,
        pending: escrow.pending,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
