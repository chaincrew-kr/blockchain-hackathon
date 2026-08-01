//! 계정 구조 — B·C 합의 진행 중 (7/29 싱크 체크포인트에서 개정, B 브랜치 반영분).
//!
//! 필드명·타입을 확정하면 packages/schema의 EscrowStatus 등 TS 타입과 명칭을
//! 일치시킬 것 (D의 온체인 이력 조회가 이 필드명에 의존한다).

use anchor_lang::prelude::*;

/// 영화별 에스크로 (PDA — seeds = [b"escrow", movie_id.as_bytes()], 개인키 부존재).
///
/// 불변식 ①③ (B 테스트 담당):
///   gross_in = pending + allocated + disputed + paid_out + refunded (+refunded — refund_pending이
///   gross_in을 건드리지 않고 pending에서만 차감하므로 우변에 refunded를 더해야 등식이 성립)
///   Pending 자금의 유일한 출구 = refund_pending
#[account]
#[derive(InitSpace)]
pub struct MovieEscrow {
    /// PDA 시드로 쓰이지만 시드는 역산 불가하므로 조회 편의를 위해 별도 저장.
    #[max_len(32)]
    pub movie_id: String,
    /// 판정 서명 권한 (정산 에이전트)
    pub authority: Pubkey,
    /// 상영관 식별자(지갑 주소) — 이슈 #5, D의 `RpcHistoryProvider`가
    /// `getProgramAccounts(memcmp: theater)`로 같은 상영관의 escrow를 묶어
    /// 조회하는 용도. `settle_batch`의 `theater_wallet`(Allocation.beneficiary)과
    /// 같은 주소여야 한다.
    pub theater: Pubkey,
    pub usdc_mint: Pubkey,
    /// 에스크로 USDC 토큰 계정
    pub vault: Pubkey,
    /// 계약서 원문(PDF) 해시 — rule_hash가 실제로 이 원문에서 나왔는지 증명하는 축
    pub contract_hash: [u8; 32],
    /// 승인된 정산 규칙 vN(JSON)의 해시 (STAGE 0) — 승인 후 변경 불가
    pub rule_hash: [u8; 32],
    pub rule_version: u16,
    pub state: EscrowState,
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
    /// settle_batch 호출(=정산된 회차) 누계 — 원래 "배치" 단위였다가 이슈 #6
    /// 재설계로 회차 단위 호출이 되면서 의미가 바뀜, 필드명은 유지
    pub batch_count: u32,
    /// mark_disputed 호출 누계 — 이 escrow가 보류 판정을 받은 횟수(이슈 #5).
    /// resolve_dispute로 분쟁이 풀려도 감소하지 않는 누적 이력 카운터.
    pub dispute_count: u32,
    /// MG(미니멈 개런티) 잔여 상환액 — `init_escrow`에서 계약상 MG 총액으로
    /// 설정되고, `settle_batch`가 회차마다 Producer 몫에서 갚아나가며 줄어든다.
    /// 0이 되면 그 이후 회차부터는 전액 Producer/Investor 이익 배분으로 감.
    pub mg_remaining: u64,
    /// 투자금 잔여 상환액 — `mg_remaining`과 동일한 패턴, MG 상환 다음
    /// 순서로 차감된다.
    pub investment_remaining: u64,
    pub bump: u8,
}

/// 에스크로 상태머신 — packages/schema의 EscrowStatus와 값 대응 (B·C 합의).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EscrowState {
    Pending,
    Verified,
    Allocated,
    Paid,
    Disputed,
}

/// 권리자별 몫 (STAGE 2 산출, escrow + beneficiary별 PDA).
///
/// 인출 제한 불변식 ② (C 테스트 담당): claim 금액 ≤ claimable − claimed
///
/// D 확인: 지금은 필드 추가 불필요. D의 ChainGateway가 escrow당 4개
/// (Theater/Distributor/Producer/Investor) PDA를 미리 계산해서 조회 —
/// seeds = [b"allocation", movie_id.as_bytes(), role as u8]. 풀 워터폴
/// 구현(이슈 #7) 이후로는 `settle_batch`가 4개 다 항상 생성한다(투자자가
/// 없는 영화라도 MG/투자 상환·이익분배율이 0이면 claimable이 계속 0일
/// 뿐 계정 자체는 존재).
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
    /// 보류 격리분 — mark_disputed로 claimable에서 옮겨진 금액 (C)
    pub disputed: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum BeneficiaryRole {
    Theater,
    Distributor,
    Producer,
    Investor,
}
