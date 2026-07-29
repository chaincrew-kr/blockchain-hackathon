//! [B] STAGE 0b: 승인 규칙 해시 등록 + 에스크로 초기화.

use anchor_lang::prelude::*;

use crate::error::EscrowError;

#[derive(Accounts)]
pub struct InitEscrow<'info> {
    // TODO(B): MovieEscrow PDA init, USDC vault(ATA) 생성, authority 지정
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    _ctx: Context<InitEscrow>,
    _rule_hash: [u8; 32],
    _rule_version: u16,
) -> Result<()> {
    // TODO(B): rule_hash·version 기록 — 이후 개정은 신규 버전 발행으로만
    err!(EscrowError::NotImplemented)
}
