//! [B] STAGE 2: 공제 워터폴 → 권리자별 Allocation 확정.
//!
//! 회차(screening) 단위 호출 (이슈 #6 결론): D의 판정 단위가 회차라서,
//! "이상 있는 회차만 격리하고 나머지는 정상 정산"하려면 회차가 끝날 때마다
//! 그 회차 순매출만 이 instruction에 넘겨야 한다. `amount`가 `escrow.pending`
//! 전체가 아니라 이번 회차분만 가리키는 이유가 이것 — 같은 영화에 대해
//! Theater/Distributor/Producer/Investor Allocation이 이미 있으면 이번 회차
//! 몫을 거기 누적하고(`init_if_needed`), 없으면 새로 만든다.
//!
//! "보류" 판정 회차는 D가 이 instruction을 아예 부르지 않거나(자금은
//! pending에 남음), 부른 직후 바로 mark_disputed로 방금 나온 배분액만
//! 얼린다 — mark_disputed는 이미 Allocation.claimable 기준으로 동작해서
//! 이 순서만 지키면 별도 변경이 필요 없다 (C 구현 그대로 재사용).
//!
//! `screening_id`는 온체인 계정에는 저장하지 않는다 — 이번 회차가 이번
//! 트랜잭션에서 정산됐다는 사실만 이벤트로 남기면 D가 로그 상관관계
//! 추적에 충분하고, PDA·계정 구조를 늘릴 이유가 없다.
//!
//! 구현 범위(풀 워터폴, 이슈 #7 — 2026-08-01 계약서에 투자·MG·이익분배율이
//!   모두 들어가기로 확정돼 축소판에서 승격):
//!   부과금(가액÷1.03×3%, 반올림) → VAT(잔액÷11) → 부율 분할 → 배급수수료
//!   → MG 상환 → 투자 상환 → 이익 배분(Producer/Investor). MG·투자 상환은
//!   `MovieEscrow.mg_remaining`/`investment_remaining`(계약 총액에서 회차마다
//!   차감되는 잔액)을 한도로 하고, 둘 다 상환이 끝난 뒤 남는 금액만 이익으로
//!   분배한다. 상환분은 각각 Distributor/Investor Allocation에 가산되고,
//!   실제 인출은 그 권리자가 STAGE 5 `claim`으로 한다 — 이 instruction은
//!   장부만 가른다.
//!
//! 계산 위치(팀 결정): 온체인. `theater_bps`/`distributor_bps`/
//!   `distribution_fee_bps`/`investor_profit_bps`는 인자로 받아 여기서 직접
//!   나눗셈·반올림을 수행하고, `escrow.rule_hash`와 대조해 "코드가 규칙을
//!   강제한다"를 실제로 검증한다(이슈 #6 후속, 2026-08-01 인코딩 확정 —
//!   `docs/archive/SCHEMA_CONTRACT.md` §11). `mg_remaining`/`investment_remaining`의
//!   초기값(계약 총액)은 `init_escrow`에서 한 번만 설정되고 재검증 대상이
//!   아니다 — 매 호출마다 다시 넘어오는 값이 아니라 계정에 고정 저장되는
//!   값이라 `contract_hash`와 같은 신뢰 경계를 쓴다.
//!
//! 전부 u64 정수 연산 — 반올림 산식은 사전 검증 필수.

use anchor_lang::prelude::*;

use crate::error::EscrowError;
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
    /// 정산 에이전트 — escrow.authority와 일치해야 하고, Allocation PDA를
    /// (처음 나오는 회차라면) 새로 만드는 rent를 지불한다.
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.movie_id.as_bytes()],
        bump = escrow.bump,
        has_one = authority @ EscrowError::InvalidState,
    )]
    pub escrow: Account<'info, MovieEscrow>,

    /// 같은 영화의 여러 회차가 이 계정에 순서대로 누적된다.
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Allocation::INIT_SPACE,
        seeds = [b"allocation", escrow.movie_id.as_bytes(), &[BeneficiaryRole::Theater as u8]],
        bump,
    )]
    pub theater_allocation: Account<'info, Allocation>,

    /// CHECK: 몫을 기록할 지갑 주소로만 쓰인다 — 실제 서명 검증은 claim에서.
    pub theater_wallet: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Allocation::INIT_SPACE,
        seeds = [b"allocation", escrow.movie_id.as_bytes(), &[BeneficiaryRole::Distributor as u8]],
        bump,
    )]
    pub distributor_allocation: Account<'info, Allocation>,

    /// CHECK: 몫을 기록할 지갑 주소로만 쓰인다 — 실제 서명 검증은 claim에서.
    pub distributor_wallet: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Allocation::INIT_SPACE,
        seeds = [b"allocation", escrow.movie_id.as_bytes(), &[BeneficiaryRole::Producer as u8]],
        bump,
    )]
    pub producer_allocation: Account<'info, Allocation>,

    /// CHECK: 몫을 기록할 지갑 주소로만 쓰인다 — 실제 서명 검증은 claim에서.
    pub producer_wallet: UncheckedAccount<'info>,

    /// MG·투자 상환 + 이익분배를 함께 받는다. 투자자가 없는 영화라도 이
    /// 계정은 만들어지지만(이슈 #7 이후 4개 고정), claimable이 계속 0일 뿐
    /// 문제 없다.
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Allocation::INIT_SPACE,
        seeds = [b"allocation", escrow.movie_id.as_bytes(), &[BeneficiaryRole::Investor as u8]],
        bump,
    )]
    pub investor_allocation: Account<'info, Allocation>,

    /// CHECK: 몫을 기록할 지갑 주소로만 쓰인다 — 실제 서명 검증은 claim에서.
    pub investor_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// STAGE 2 정산 완료 이벤트 — D의 온체인 이력 조회 대상.
/// screening_id는 계정에는 없고 이 이벤트로만 추적된다.
#[event]
pub struct SettledEvent {
    pub escrow: Pubkey,
    pub movie_id: String,
    pub screening_id: String,
    pub gross: u64,
    pub levy: u64,
    pub vat: u64,
    pub theater_amount: u64,
    /// 배급수수료만(MG 상환분 제외) — 배급사 몫 전체는 이 값 + `mg_recoup`.
    pub distribution_fee: u64,
    /// 이번 회차에서 상환된 MG — Distributor Allocation에 가산됨.
    pub mg_recoup: u64,
    /// 이번 회차에서 상환된 투자금 — Investor Allocation에 가산됨.
    pub investment_recoup: u64,
    /// 상환 이후 이익 배분에서 투자자가 받은 몫 — Investor Allocation에 가산됨.
    pub investor_profit: u64,
    /// 최종 Producer 몫(부율 분할 → 배급수수료 → MG·투자 상환 → 이익분배까지
    /// 다 거친 뒤 실제로 Producer Allocation에 들어가는 값).
    pub producer_amount: u64,
    pub timestamp: i64,
}

/// 이미 있으면 기존 값과 같은지 확인하고, 처음이면(디폴트 Pubkey) 새로 묶는다.
/// 나중 회차에서 다른 지갑이 실수로 들어오면 조용히 수취인이 바뀌는 대신
/// 즉시 거부한다.
fn bind_beneficiary(allocation: &mut Account<Allocation>, wallet: Pubkey) -> Result<()> {
    if allocation.beneficiary == Pubkey::default() {
        allocation.beneficiary = wallet;
    } else {
        require!(allocation.beneficiary == wallet, EscrowError::Unauthorized);
    }
    Ok(())
}

pub fn handler(
    ctx: Context<SettleBatch>,
    screening_id: String,
    amount: u64,
    theater_bps: u16,
    distributor_bps: u16,
    distribution_fee_bps: u16,
    // MG·투자 상환이 끝난 뒤 남는 이익 중 투자자 몫 (나머지는 Producer).
    investor_profit_bps: u16,
) -> Result<()> {
    // Verified(첫 회차) 또는 Allocated/Disputed(이미 다른 회차를 정산한 뒤,
    // 또는 별개 권리자가 분쟁 중인 상태에서 새 회차가 들어오는 경우) 모두
    // 허용한다 — mark_disputed/resolve_dispute와 같은 다중 상태 허용 패턴.
    require!(
        matches!(
            ctx.accounts.escrow.state,
            EscrowState::Verified | EscrowState::Allocated | EscrowState::Disputed
        ),
        EscrowError::InvalidState
    );
    require!(
        (theater_bps as u64)
            .checked_add(distributor_bps as u64)
            .ok_or(EscrowError::MathOverflow)?
            == BPS_DENOMINATOR,
        EscrowError::InvalidWaterfallParams
    );
    require!(
        (investor_profit_bps as u64) <= BPS_DENOMINATOR,
        EscrowError::InvalidWaterfallParams
    );

    // rule_hash 검증 (SCHEMA_CONTRACT §11, A·B·D 합의): SettlementRule 전체가
    // 아니라 온체인이 실제로 쓰는 숫자(rule_version, *_bps 4개)만 검증 대상으로
    // 좁힌다 — 조항 원문·충돌·승인 여부 등은 이 instruction의 인자로 넘어오지
    // 않으므로 애초에 재현할 수 없다. 인코딩은 TicketEvent 해시체인
    // (apps/agent/src/risk-check/hash.ts)과 동일하게 필드를 "|"로 join한
    // 문자열을 sha256 — JSON 직렬화의 키 순서·숫자 표현 불일치 위험을 피한다.
    let rule_preimage = format!(
        "{}|{}|{}|{}|{}",
        ctx.accounts.escrow.rule_version,
        theater_bps,
        distributor_bps,
        distribution_fee_bps,
        investor_profit_bps
    );
    let computed_rule_hash =
        anchor_lang::solana_program::hash::hash(rule_preimage.as_bytes()).to_bytes();
    require!(
        computed_rule_hash == ctx.accounts.escrow.rule_hash,
        EscrowError::RuleHashMismatch
    );

    let gross = amount;
    require!(
        gross > 0 && gross <= ctx.accounts.escrow.pending,
        EscrowError::InvalidState
    );

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

    // 배급수수료 — 배급 몫에서 공제해 배급사가 수취, 나머지는 Producer 풀로.
    let distribution_fee =
        mul_div_floor(distributor_amount, distribution_fee_bps as u64, BPS_DENOMINATOR)?;
    let producer_pool = distributor_amount
        .checked_sub(distribution_fee)
        .ok_or(EscrowError::MathOverflow)?;

    // MG 상환 — Producer 풀에서 계약상 MG 잔액 한도까지 갚는다. 상환분은
    // Producer가 아니라 Distributor 몫(MG를 먼저 지급한 쪽)으로 돌아간다.
    let mg_remaining = ctx.accounts.escrow.mg_remaining;
    let mg_recoup = producer_pool.min(mg_remaining);
    let pool_after_mg = producer_pool
        .checked_sub(mg_recoup)
        .ok_or(EscrowError::MathOverflow)?;

    // 투자 상환 — MG 상환 다음 순서로, 남은 풀에서 투자금 잔액 한도까지
    // Investor 몫으로 뗀다.
    let investment_remaining = ctx.accounts.escrow.investment_remaining;
    let investment_recoup = pool_after_mg.min(investment_remaining);
    let pool_after_investment = pool_after_mg
        .checked_sub(investment_recoup)
        .ok_or(EscrowError::MathOverflow)?;

    // 이익 배분 — 두 상환이 끝난 뒤 남는 풀만 Producer/Investor 간 계약상
    // 이익분배율로 나눈다. Investor 몫을 먼저 계산하고 Producer는 나머지
    // 전부로 정해서 반올림 손실 없이 pool_after_investment = investor_profit
    // + producer_amount가 항상 성립하게 한다 (부율 분할과 동일한 패턴).
    let investor_profit =
        mul_div_floor(pool_after_investment, investor_profit_bps as u64, BPS_DENOMINATOR)?;
    let producer_amount = pool_after_investment
        .checked_sub(investor_profit)
        .ok_or(EscrowError::MathOverflow)?;

    let distributor_final = distribution_fee
        .checked_add(mg_recoup)
        .ok_or(EscrowError::MathOverflow)?;
    let investor_final = investment_recoup
        .checked_add(investor_profit)
        .ok_or(EscrowError::MathOverflow)?;

    let allocated_total = theater_amount
        .checked_add(distributor_final)
        .and_then(|sum| sum.checked_add(investor_final))
        .and_then(|sum| sum.checked_add(producer_amount))
        .ok_or(EscrowError::MathOverflow)?;
    let paid_out_delta = levy.checked_add(vat).ok_or(EscrowError::MathOverflow)?;

    // 불변식 ①: 이번 회차에서 나눈 금액이 이번 회차 총액을 정확히
    // 재구성해야 한다 (다른 회차 누적분과는 무관하게 매 호출마다 검증).
    require!(
        allocated_total
            .checked_add(paid_out_delta)
            .ok_or(EscrowError::MathOverflow)?
            == gross,
        EscrowError::MathOverflow
    );

    let escrow_key = ctx.accounts.escrow.key();
    let rule_version = ctx.accounts.escrow.rule_version;

    bind_beneficiary(&mut ctx.accounts.theater_allocation, ctx.accounts.theater_wallet.key())?;
    let theater = &mut ctx.accounts.theater_allocation;
    theater.escrow = escrow_key;
    theater.role = BeneficiaryRole::Theater;
    theater.claimable = theater
        .claimable
        .checked_add(theater_amount)
        .ok_or(EscrowError::MathOverflow)?;
    theater.rule_version = rule_version;
    theater.bump = ctx.bumps.theater_allocation;

    bind_beneficiary(
        &mut ctx.accounts.distributor_allocation,
        ctx.accounts.distributor_wallet.key(),
    )?;
    let distributor = &mut ctx.accounts.distributor_allocation;
    distributor.escrow = escrow_key;
    distributor.role = BeneficiaryRole::Distributor;
    distributor.claimable = distributor
        .claimable
        .checked_add(distributor_final)
        .ok_or(EscrowError::MathOverflow)?;
    distributor.rule_version = rule_version;
    distributor.bump = ctx.bumps.distributor_allocation;

    bind_beneficiary(&mut ctx.accounts.producer_allocation, ctx.accounts.producer_wallet.key())?;
    let producer = &mut ctx.accounts.producer_allocation;
    producer.escrow = escrow_key;
    producer.role = BeneficiaryRole::Producer;
    producer.claimable = producer
        .claimable
        .checked_add(producer_amount)
        .ok_or(EscrowError::MathOverflow)?;
    producer.rule_version = rule_version;
    producer.bump = ctx.bumps.producer_allocation;

    bind_beneficiary(&mut ctx.accounts.investor_allocation, ctx.accounts.investor_wallet.key())?;
    let investor = &mut ctx.accounts.investor_allocation;
    investor.escrow = escrow_key;
    investor.role = BeneficiaryRole::Investor;
    investor.claimable = investor
        .claimable
        .checked_add(investor_final)
        .ok_or(EscrowError::MathOverflow)?;
    investor.rule_version = rule_version;
    investor.bump = ctx.bumps.investor_allocation;

    let escrow = &mut ctx.accounts.escrow;
    escrow.mg_remaining = mg_remaining
        .checked_sub(mg_recoup)
        .ok_or(EscrowError::MathOverflow)?;
    escrow.investment_remaining = investment_remaining
        .checked_sub(investment_recoup)
        .ok_or(EscrowError::MathOverflow)?;
    // 부과금·VAT는 권리자 Allocation 없이 즉시 확정되는 통계상 지급으로
    // 취급한다 (실제 국세청 납부 경로는 이 프로그램 범위 밖) — pending에서
    // 바로 paid_out으로 옮겨, 어떤 Allocation에도 안 묶인 채로 allocated가
    // 부풀지 않게 한다. 이번 회차분(amount)만 차감하고 나머지 회차 몫은
    // pending에 그대로 남아 다음 호출을 기다린다.
    escrow.pending = escrow
        .pending
        .checked_sub(amount)
        .ok_or(EscrowError::MathOverflow)?;
    escrow.allocated = escrow
        .allocated
        .checked_add(allocated_total)
        .ok_or(EscrowError::MathOverflow)?;
    escrow.paid_out = escrow
        .paid_out
        .checked_add(paid_out_delta)
        .ok_or(EscrowError::MathOverflow)?;
    escrow.batch_count = escrow.batch_count.checked_add(1).ok_or(EscrowError::MathOverflow)?;
    if escrow.state == EscrowState::Verified {
        escrow.state = EscrowState::Allocated;
    }

    emit!(SettledEvent {
        escrow: escrow_key,
        movie_id: escrow.movie_id.clone(),
        screening_id,
        gross,
        levy,
        vat,
        theater_amount,
        distribution_fee,
        mg_recoup,
        investment_recoup,
        investor_profit,
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
