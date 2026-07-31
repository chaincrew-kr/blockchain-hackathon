//! [B] STAGE 2: 공제 워터폴 → 권리자별 Allocation 확정.
//!
//! 구현 범위(축소, 팀 결정 — 실행계획서 STAGE 2 "지연 시 축소" 안):
//!   부과금(가액÷1.03×3%, 반올림) → VAT(잔액÷11) → 부율 분할 → 배급수수료
//!   → 잔액 전액 Producer. MG 상환/투자 상환/이익 배분(풀 구현)은 아래
//!   handler 하단에 주석으로 남겨둠 — MovieEscrow에 MG·투자 잔액을 추적할
//!   필드가 아직 없어서, 필드 추가 후 이어서 구현.
//!
//! 계산 위치(팀 결정): 온체인. `theater_bps`/`distributor_bps`/
//!   `distribution_fee_bps`는 인자로 받아 여기서 직접 나눗셈·반올림을
//!   수행한다. 원래는 이 값들을 해시해 `escrow.rule_hash`와 대조해야
//!   "코드가 규칙을 강제한다"는 서사가 완성되지만, SettlementRule → rule_hash
//!   인코딩 방식이 아직 B·D 간 미확정(`docs/SCHEMA_CONTRACT.md` §11)이라
//!   지금은 authority 서명만으로 신뢰한다 (verify_escrow와 동일한 신뢰
//!   경계). 인코딩 합의되면 TODO(B·D) 지점에 해시 검증 추가.
//!
//! 전부 u64 정수 연산 — 반올림 산식은 사전 검증 필수.

use anchor_lang::prelude::*;

use crate::error::EscrowError;
use crate::guards::require_state;
use crate::state::{Allocation, BeneficiaryRole, EscrowState, MovieEscrow};

/// 부과금 = 가액(VAT 포함) ÷ 1.03 × 3% = 가액 × 3/103.
const LEVY_NUMERATOR: u128 = 3;
const LEVY_DENOMINATOR: u128 = 103;
/// VAT = 부과금 공제 후 잔액 ÷ 11.
const VAT_DENOMINATOR: u64 = 11;
/// 부율·배급수수료율은 basis point(1/10000) 단위로 받는다.
const BPS_DENOMINATOR: u64 = 10_000;

#[derive(Accounts)]
pub struct SettleBatch<'info> {
    /// 정산 에이전트 — escrow.authority와 일치해야 하고, Allocation PDA
    /// 3개(Theater/Distributor/Producer)의 rent를 지불한다.
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.movie_id.as_bytes()],
        bump = escrow.bump,
        has_one = authority @ EscrowError::InvalidState,
    )]
    pub escrow: Account<'info, MovieEscrow>,

    #[account(
        init,
        payer = authority,
        space = 8 + Allocation::INIT_SPACE,
        seeds = [b"allocation", escrow.movie_id.as_bytes(), &[BeneficiaryRole::Theater as u8]],
        bump,
    )]
    pub theater_allocation: Account<'info, Allocation>,

    /// CHECK: 몫을 기록할 지갑 주소로만 쓰인다 — 실제 서명 검증은 claim에서.
    pub theater_wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Allocation::INIT_SPACE,
        seeds = [b"allocation", escrow.movie_id.as_bytes(), &[BeneficiaryRole::Distributor as u8]],
        bump,
    )]
    pub distributor_allocation: Account<'info, Allocation>,

    /// CHECK: 몫을 기록할 지갑 주소로만 쓰인다 — 실제 서명 검증은 claim에서.
    pub distributor_wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Allocation::INIT_SPACE,
        seeds = [b"allocation", escrow.movie_id.as_bytes(), &[BeneficiaryRole::Producer as u8]],
        bump,
    )]
    pub producer_allocation: Account<'info, Allocation>,

    /// CHECK: 몫을 기록할 지갑 주소로만 쓰인다 — 실제 서명 검증은 claim에서.
    pub producer_wallet: UncheckedAccount<'info>,

    // 풀 구현 시 investor_allocation + investor_wallet 추가
    // (seeds = [b"allocation", movie_id, BeneficiaryRole::Investor as u8]).
    // 축소판은 MG·투자 상환을 하지 않으므로 Investor 몫이 항상 0이라 계정을
    // 아예 만들지 않는다 — state.rs 주석의 "역할이 없으면 계정 자체가 없는
    // 것으로 처리" 규칙과 동일.
    pub system_program: Program<'info, System>,
}

/// STAGE 2 정산 완료 이벤트 — D의 온체인 이력 조회 대상.
#[event]
pub struct SettledEvent {
    pub escrow: Pubkey,
    pub movie_id: String,
    pub gross: u64,
    pub levy: u64,
    pub vat: u64,
    pub theater_amount: u64,
    pub distribution_fee: u64,
    pub producer_amount: u64,
    pub timestamp: i64,
}

pub fn handler(
    ctx: Context<SettleBatch>,
    theater_bps: u16,
    distributor_bps: u16,
    distribution_fee_bps: u16,
) -> Result<()> {
    require_state(&ctx.accounts.escrow, EscrowState::Verified)?;
    require!(
        (theater_bps as u64)
            .checked_add(distributor_bps as u64)
            .ok_or(EscrowError::MathOverflow)?
            == BPS_DENOMINATOR,
        EscrowError::InvalidWaterfallParams
    );

    let gross = ctx.accounts.escrow.pending;
    require!(gross > 0, EscrowError::InvalidState);

    // 부과금: 가액(VAT 포함) ÷ 1.03 × 3%, 반올림.
    let levy = round_div_half_up(gross as u128 * LEVY_NUMERATOR, LEVY_DENOMINATOR)?;
    let after_levy = gross.checked_sub(levy).ok_or(EscrowError::MathOverflow)?;

    // VAT: 부과금 공제 후 잔액 ÷ 11 (내림).
    let vat = after_levy / VAT_DENOMINATOR;
    let net_revenue = after_levy.checked_sub(vat).ok_or(EscrowError::MathOverflow)?;

    // 부율 분할 — 극장 몫을 먼저 계산하고, 배급 몫은 나머지 전부로 정해서
    // 반올림 손실 없이 net_revenue = theater_amount + distributor_amount가
    // 항상 성립하게 한다.
    let theater_amount = mul_div_floor(net_revenue, theater_bps as u64, BPS_DENOMINATOR)?;
    let distributor_amount = net_revenue
        .checked_sub(theater_amount)
        .ok_or(EscrowError::MathOverflow)?;

    // 배급수수료 — 배급 몫에서 공제해 배급사가 수취, 나머지는 Producer로.
    let distribution_fee =
        mul_div_floor(distributor_amount, distribution_fee_bps as u64, BPS_DENOMINATOR)?;
    let producer_amount = distributor_amount
        .checked_sub(distribution_fee)
        .ok_or(EscrowError::MathOverflow)?;

    // ── 풀 워터폴(주석, 미구현) ──────────────────────────────────────────
    // MG 상환: MovieEscrow에 `mg_remaining: u64` 필드 추가 필요.
    //   let mg_recoup = producer_amount.min(escrow.mg_remaining);
    //   escrow.mg_remaining -= mg_recoup;
    //   producer_amount -= mg_recoup;  // 상환분은 Distributor Allocation에 가산
    //
    // 투자 상환: MovieEscrow에 `investment_remaining: u64` 필드 추가 필요,
    //   위와 동일한 패턴으로 producer_amount에서 상환 후 Investor
    //   Allocation에 가산 (Investor Allocation PDA도 이때 함께 추가).
    //
    // 이익 배분: 위 두 상환이 끝난 뒤 남는 producer_amount를 Producer/
    //   Investor 간 별도 이익분배율(계약서 조항 필요, 지금 SettlementRule에
    //   필드 없음)로 다시 나눔.
    // ─────────────────────────────────────────────────────────────────────

    let allocated_total = theater_amount
        .checked_add(distribution_fee)
        .and_then(|sum| sum.checked_add(producer_amount))
        .ok_or(EscrowError::MathOverflow)?;
    let paid_out_delta = levy.checked_add(vat).ok_or(EscrowError::MathOverflow)?;

    // 불변식 ①: 이 배치에서 나눈 금액이 배치 총액을 정확히 재구성해야 한다.
    require!(
        allocated_total
            .checked_add(paid_out_delta)
            .ok_or(EscrowError::MathOverflow)?
            == gross,
        EscrowError::MathOverflow
    );

    let escrow_key = ctx.accounts.escrow.key();
    let rule_version = ctx.accounts.escrow.rule_version;

    let theater = &mut ctx.accounts.theater_allocation;
    theater.escrow = escrow_key;
    theater.beneficiary = ctx.accounts.theater_wallet.key();
    theater.role = BeneficiaryRole::Theater;
    theater.claimable = theater_amount;
    theater.claimed = 0;
    theater.rule_version = rule_version;
    theater.bump = ctx.bumps.theater_allocation;

    let distributor = &mut ctx.accounts.distributor_allocation;
    distributor.escrow = escrow_key;
    distributor.beneficiary = ctx.accounts.distributor_wallet.key();
    distributor.role = BeneficiaryRole::Distributor;
    distributor.claimable = distribution_fee;
    distributor.claimed = 0;
    distributor.rule_version = rule_version;
    distributor.bump = ctx.bumps.distributor_allocation;

    let producer = &mut ctx.accounts.producer_allocation;
    producer.escrow = escrow_key;
    producer.beneficiary = ctx.accounts.producer_wallet.key();
    producer.role = BeneficiaryRole::Producer;
    producer.claimable = producer_amount;
    producer.claimed = 0;
    producer.rule_version = rule_version;
    producer.bump = ctx.bumps.producer_allocation;

    let escrow = &mut ctx.accounts.escrow;
    // 부과금·VAT는 권리자 Allocation 없이 즉시 확정되는 통계상 지급으로
    // 취급한다 (실제 국세청 납부 경로는 이 프로그램 범위 밖) — pending에서
    // 바로 paid_out으로 옮겨, 어떤 Allocation에도 안 묶인 채로 allocated가
    // 부풀지 않게 한다.
    escrow.pending = 0;
    escrow.allocated = escrow
        .allocated
        .checked_add(allocated_total)
        .ok_or(EscrowError::MathOverflow)?;
    escrow.paid_out = escrow
        .paid_out
        .checked_add(paid_out_delta)
        .ok_or(EscrowError::MathOverflow)?;
    escrow.batch_count = escrow.batch_count.checked_add(1).ok_or(EscrowError::MathOverflow)?;
    escrow.state = EscrowState::Allocated;

    emit!(SettledEvent {
        escrow: escrow_key,
        movie_id: escrow.movie_id.clone(),
        gross,
        levy,
        vat,
        theater_amount,
        distribution_fee,
        producer_amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

/// numerator × mul ÷ div, 내림. u128 중간 연산으로 오버플로 방지.
fn mul_div_floor(numerator: u64, mul: u64, div: u64) -> Result<u64> {
    let product = (numerator as u128)
        .checked_mul(mul as u128)
        .ok_or(EscrowError::MathOverflow)?;
    u64::try_from(product / (div as u128)).map_err(|_| EscrowError::MathOverflow.into())
}

/// numerator(이미 mul 적용된 값) ÷ denominator, 반올림(half up).
fn round_div_half_up(numerator: u128, denominator: u128) -> Result<u64> {
    let result = (numerator + denominator / 2) / denominator;
    u64::try_from(result).map_err(|_| EscrowError::MathOverflow.into())
}
