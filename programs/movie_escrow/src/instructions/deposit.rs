//! [B] STAGE 1: 관객 결제 입금 — 수취 주소가 곧 에스크로 (경유 계좌 0개).
//!
//! `screening_id`/`seat`/ms 단위 `timestamp`는 D의 P5 해시 연속성 검증
//! (`hashTicketEvent`, apps/agent/src/risk-check/hash.ts)이 기대하는 원천
//! 필드다 (이슈 #8). 실제 해시(prevHash 포함)는 온체인에서 계산하지 않는다
//! — 프로그램은 자신이 속한 트랜잭션의 서명을 알 방법이 없어서(해시 산식이
//! txSignature를 포함) 애초에 온체인 계산이 불가능하고, D가 이벤트 로그를
//! 순서대로 읽어 오프체인에서 체인을 구성한다. 이 event는 그 원천 재료만
//! 정확한 필드로 내보내는 역할이다.

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

/// STAGE 1 발권 이벤트 — D의 STAGE 3 위험조정검증(P5 해시 연속성 포함)이
/// 오프체인에서 읽는 원천 데이터. `TicketEvent`(packages/schema)와 필드
/// 대응: kind="issue"(이벤트 종류로 암시), screening_id→screeningId,
/// seat→seat, amount→amount, timestamp(ms)→timestamp.
#[event]
pub struct DepositEvent {
    pub escrow: Pubkey,
    pub movie_id: String,
    pub payer: Pubkey,
    pub screening_id: String,
    pub seat: String,
    pub amount: u64,
    pub gross_in: u64,
    pub pending: u64,
    /// unix ms — D는 ms를 전제로 한다 (packages/schema). Solana
    /// Clock::unix_timestamp는 초 단위라 여기서 ×1000 해서 맞춘다.
    pub timestamp: i64,
}

pub fn handler(
    ctx: Context<Deposit>,
    screening_id: String,
    seat: String,
    amount: u64,
) -> Result<()> {
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
        screening_id,
        seat,
        amount,
        gross_in: escrow.gross_in,
        pending: escrow.pending,
        timestamp: Clock::get()?.unix_timestamp * 1000,
    });

    Ok(())
}
