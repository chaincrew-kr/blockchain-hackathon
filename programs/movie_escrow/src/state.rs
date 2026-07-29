//! 계정 구조 — ⚠️ B·C 합의 필수 (7/29 싱크 체크포인트).
//!
//! 아래는 논의 시작용 초안이다. 필드명·타입을 확정하면 packages/schema의
//! EscrowStatus 등 TS 타입과 명칭을 일치시킬 것 (D의 온체인 이력 조회가
//! 이 필드명에 의존한다).

use anchor_lang::prelude::*;

/// 영화별 에스크로 (PDA — 개인키 부존재, 격리 불변식 ②).
///
/// 불변식 ①③ (B 테스트 담당):
///   gross_in = pending + allocated + disputed + paid_out + refunded
///   Pending 자금의 유일한 출구 = refund_pending
#[account]
#[derive(InitSpace)]
pub struct MovieEscrow {
    /// 판정 서명 권한 (정산 에이전트)
    pub authority: Pubkey,
    pub usdc_mint: Pubkey,
    /// 에스크로 USDC 토큰 계정
    pub vault: Pubkey,
    /// 승인된 정산 규칙 vN의 해시 (STAGE 0) — 승인 후 변경 불가
    pub rule_hash: [u8; 32],
    pub rule_version: u16,
    /// 총 유입 누계
    pub gross_in: u64,
    /// 미귀속(Pending) — 전원 인출 불가
    pub pending: u64,
    /// settle_batch로 귀속 확정된 합계
    pub allocated: u64,
    /// 보류 격리분
    pub disputed: u64,
    /// 지급 완료 누계
    pub paid_out: u64,
    /// 관객 환불 누계
    pub refunded: u64,
    pub batch_count: u32,
    pub bump: u8,
}

/// 권리자별 몫 (STAGE 2 산출, escrow + beneficiary별 PDA).
///
/// 인출 제한 불변식 ② (C 테스트 담당): claim 금액 ≤ claimable − claimed
#[account]
#[derive(InitSpace)]
pub struct Allocation {
    pub escrow: Pubkey,
    /// 극장/배급/제작/투자 지갑
    pub beneficiary: Pubkey,
    pub role: BeneficiaryRole,
    /// 인출 가능 확정액
    pub claimable: u64,
    /// 인출 완료 누계
    pub claimed: u64,
    /// 어떤 규칙 vN으로 계산됐는지 바인딩 (STAGE 2)
    pub rule_version: u16,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum BeneficiaryRole {
    Theater,
    Distributor,
    Producer,
    Investor,
}
