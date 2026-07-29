//! [C] STAGE 5: 권리자 인출 — 초과 인출은 온체인 거부 (데모 클라이맥스).

use anchor_lang::prelude::*;

use crate::error::EscrowError;

#[derive(Accounts)]
pub struct Claim<'info> {
    // TODO(C): beneficiary Signer + 본인 Allocation PDA + escrow vault
    pub beneficiary: Signer<'info>,
}

pub fn handler(_ctx: Context<Claim>, _amount: u64) -> Result<()> {
    // TODO(C): amount > claimable − claimed 이면 ExceedsClaimable (불변식 ②)
    // TODO(C): vault → beneficiary 이체, claimed += amount, paid_out += amount
    err!(EscrowError::NotImplemented)
}
