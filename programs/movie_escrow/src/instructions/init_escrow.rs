//! [B] STAGE 0b: 승인 규칙 해시 등록 + 에스크로 초기화.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::{EscrowState, MovieEscrow};

#[derive(Accounts)]
#[instruction(movie_id: String)]
pub struct InitEscrow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + MovieEscrow::INIT_SPACE,
        seeds = [b"escrow", movie_id.as_bytes()],
        bump,
    )]
    pub escrow: Account<'info, MovieEscrow>,

    /// 이미 존재하는 USDC 민트(로컬넷 테스트에선 임시로 만든 mint를 씀).
    pub usdc_mint: Account<'info, Mint>,

    /// escrow PDA가 소유하는 USDC 토큰 계정 — ATA로 생성.
    #[account(
        init,
        payer = payer,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// 정산 에이전트 — 본인 동의 없이 제3자가 임의 주소를 정산 권한자로
    /// 지정하지 못하도록 escrow 생성 시점에 직접 서명하게 한다.
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitEscrow>,
    movie_id: String,
    theater: Pubkey,
    contract_hash: [u8; 32],
    rule_hash: [u8; 32],
    rule_version: u16,
    // 계약서상 MG(미니멈 개런티) 총액 — 0이면 이 영화는 MG 없음.
    mg_amount: u64,
    // 계약서상 투자금 총액 — 0이면 외부 투자자 없음.
    investment_amount: u64,
) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    escrow.movie_id = movie_id;
    escrow.authority = ctx.accounts.authority.key();
    escrow.theater = theater;
    escrow.usdc_mint = ctx.accounts.usdc_mint.key();
    escrow.vault = ctx.accounts.vault.key();
    escrow.contract_hash = contract_hash;
    escrow.rule_hash = rule_hash;
    escrow.rule_version = rule_version;
    escrow.state = EscrowState::Pending;
    escrow.gross_in = 0;
    escrow.pending = 0;
    escrow.allocated = 0;
    escrow.disputed = 0;
    escrow.paid_out = 0;
    escrow.refunded = 0;
    escrow.batch_count = 0;
    escrow.dispute_count = 0;
    escrow.mg_remaining = mg_amount;
    escrow.investment_remaining = investment_amount;
    escrow.bump = ctx.bumps.escrow;
    Ok(())
}
