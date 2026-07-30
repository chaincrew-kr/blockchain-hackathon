use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Instruction not implemented yet")]
    NotImplemented,
    #[msg("Claim amount exceeds claimable balance")]
    ExceedsClaimable,
    #[msg("Invalid escrow state for this instruction")]
    InvalidState,
    #[msg("Arithmetic overflow in settlement math")]
    MathOverflow,
    #[msg("Rule hash does not match the approved settlement rule")]
    RuleHashMismatch,
    #[msg("Waterfall split parameters are invalid (rates must sum to 100%)")]
    InvalidWaterfallParams,
}
