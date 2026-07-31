//! 재사용 가능한 상태 게이트 — instruction마다 상태 체크를 중복 작성하지 않도록 분리.
//! (D 제안: STAGE 3 검증 통과 여부를 별도 모듈로 게이트화)

use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::state::{EscrowState, MovieEscrow};

/// escrow가 기대한 상태인지 확인 — 아니면 InvalidState로 거부.
pub fn require_state(escrow: &MovieEscrow, expected: EscrowState) -> Result<()> {
    require!(escrow.state == expected, EscrowError::InvalidState);
    Ok(())
}
