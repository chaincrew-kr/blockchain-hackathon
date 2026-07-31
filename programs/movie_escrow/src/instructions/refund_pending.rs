//! [B] STAGE 1: Pending 자금의 유일한 출구 — 관객 환불 (격리 불변식 ③).
//!
//! 자기 서비스 환불: settle_batch 이전(Pending)엔 에이전트 승인 없이 관객
//! 본인이 직접 청구한다. "본인 외 수취 불가"는 payer_token_account를
//! payer(서명자) 소유 ATA로 제약해서 강제한다 — 이 스키마는 입금자별
//! 원장을 안 두므로, 서명자=목적지 소유자가 곧 "본인" 확인의 전부다.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::state::MovieEscrow;

#[derive(Accounts)]
pub struct RefundPending<'info> {
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.movie_id.as_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, MovieEscrow>,

    /// 환불을 받는 계정 — 반드시 payer 본인 소유 ATA.
    #[account(
        mut,
        associated_token::mint = escrow.usdc_mint,
        associated_token::authority = payer,
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    #[account(mut, address = escrow.vault)]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/// STAGE 1 환불 이벤트 — DepositEvent와 대칭, D의 P5 해시 연속성 검증이
/// 오프체인에서 읽는 원천 데이터 (kind="refund", 이슈 #8).
#[event]
pub struct RefundEvent {
    pub escrow: Pubkey,
    pub movie_id: String,
    pub payer: Pubkey,
    pub screening_id: String,
    pub seat: String,
    pub amount: u64,
    pub pending: u64,
    pub refunded: u64,
    /// unix ms — DepositEvent와 동일하게 ×1000.
    pub timestamp: i64,
}

pub fn handler(
    ctx: Context<RefundPending>,
    screening_id: String,
    seat: String,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, EscrowError::InvalidState);

    let movie_id = ctx.accounts.escrow.movie_id.clone();
    let bump = ctx.accounts.escrow.bump;
    let seeds: &[&[u8]] = &[b"escrow", movie_id.as_bytes(), &[bump]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.payer_token_account.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;

    let escrow = &mut ctx.accounts.escrow;
    // 격리 불변식 ③: Pending 자금의 유일한 출구가 이 경로이므로, 여기서
    // pending 잔액을 초과한 환불 요청은 반드시 거부돼야 한다.
    escrow.pending = escrow
        .pending
        .checked_sub(amount)
        .ok_or(EscrowError::InvalidState)?;
    escrow.refunded = escrow
        .refunded
        .checked_add(amount)
        .ok_or(EscrowError::MathOverflow)?;

    emit!(RefundEvent {
        escrow: escrow.key(),
        movie_id: escrow.movie_id.clone(),
        payer: ctx.accounts.payer.key(),
        screening_id,
        seat,
        amount,
        pending: escrow.pending,
        refunded: escrow.refunded,
        timestamp: Clock::get()?.unix_timestamp * 1000,
    });

    Ok(())
}
