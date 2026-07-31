# B 정서윤 작업 정리

> 담당: **B — 체인·자금흐름 / 정서윤**
> 범위: `init_escrow` · `deposit` · `refund_pending` · `settle_batch` (STAGE 0b·1·2)
> 브랜치: `feat/escrow-fund-flow`

## 현재 상태 — 2026-08-01

- ✅ 완료: **PR #36 머지** — `authority` 서명 검증 + `settle_batch` 회차 단위 재설계(이슈 #6) + `deposit`/`refund_pending` 해시체인 필드(이슈 #8)가 `dev`에 반영됨. 머지 전 CI가 `docs/youn_work/README.md`의 prettier 포맷 문제로 막혀 있던 것도 같이 고침
- ✅ 완료: **`rule_hash` 온체인 검증 구현(이슈 #6 후속, `docs/SCHEMA_CONTRACT.md` §11)** — 인코딩 확정(풀 워터폴 반영 후 최종적으로 `rule_version`/`theater_bps`/`distributor_bps`/`distribution_fee_bps`/`investor_profit_bps` 5개 필드). `settle_batch.rs`에 검증 추가, A가 쓸 `computeRuleHash()` 헬퍼를 `apps/web/src/lib/hash.ts`에 추가 (아래 상세)
- ✅ 완료: **이슈 #5 완결 — 상영관 이력 조회** — `MovieEscrow.dispute_count: u32`(계정 필드, `mark_disputed`에서 증가) + `MovieEscrow.theater: Pubkey`(`init_escrow`에서 설정) 둘 다 구현 완료. D의 `RpcHistoryProvider`가 `getProgramAccounts(theater memcmp)`로 상영관별 이력을 실제로 집계할 수 있게 됨. `anomalyCount`는 온체인 트리거가 없어 온체인 미기록으로 결정(아래 상세)
- ✅ 완료: **0원 무료 발권 허용(이슈 #8 잔여 항목, 팀 결정)** — `deposit`이 `amount == 0`을 허용하도록 변경, A의 무료 티켓 버튼이 그대로 호출 가능
- ✅ 완료: **`settle_batch` 풀 워터폴(이슈 #7)** — MG 상환·투자 상환·이익 배분(Producer/Investor)까지 전부 구현. 계약서에 MG·투자·이익분배율이 들어가기로 확정되면서 축소판에서 풀 구현으로 승격
- ✅ 완료: IDL 재생성 — 오늘 추가된 필드·계정·인자 전부 반영해 `packages/schema/idl/` 갱신

## 현재 상태 — 2026-07-31

- ✅ 완료: `init_escrow`, `deposit`, `refund_pending` 구현 + 테스트 통과 + `dev` merge 완료
- ✅ 완료: `verify_escrow` 구현 — STAGE 3→2 게이트(Pending → Verified), `dev` merge 완료 (PR #27)
- ✅ 완료: CI `npm ci` lockfile 불완전 문제 수정 (PR #26)
- ✅ 완료: D와 `Allocation` 출력 구조 합의 — 필드 추가 불필요, 역할별(최대 4개) PDA를 `[b"allocation", movie_id, role_byte]` 시드로 조회 (커밋 e11555b)
- ✅ 완료: `settle_batch` 구현(축소 워터폴) + 테스트 통과 + localnet 배포 확인 (PR #29)
- ✅ 완료(C, PR #30): `claim`·`mark_disputed`·`resolve_dispute` 구현 + `Allocation.disputed` 필드 추가 — 인출 제한 불변식②가 `claimable − claimed − disputed`로 갱신됨
- ✅ 완료: `authority` 서명 검증 — `init_escrow`의 `authority`를 `UncheckedAccount` → `Signer`로 변경. C 담당 instruction(verify_escrow 이후 전부)은 이미 `has_one = authority` + `Signer` 패턴으로 검증하고 있었어서, 남은 구멍은 `init_escrow` 하나였음
- ✅ 완료: **이슈 #6 해결** — `settle_batch`를 회차(screening) 단위 호출로 재설계, D의 `ChainGateway` 시그니처와 맞춤 (아래 상세)
- ✅ 완료(부분): **이슈 #8** — `deposit`/`refund_pending`에 `screening_id`/`seat` 추가 + `timestamp`를 ms 단위로 전환, D의 P5 해시 연속성 검증이 필요로 하는 원천 필드를 채움 (0원 무료 발권 포함 여부는 미결 — 아래 "다음 할 일")
- 이슈 #7(EscrowStatus 열거형)·#17(데모 최소 경로 5개 instruction)은 **이미 충족된 상태** 확인 — GitHub에서 닫아도 됨 (아래 결정 사항 참고)

## 결정 사항

| 항목                   | 결정                                                                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anchor 툴체인          | `Anchor.toml`에 `solana_version = "4.1.1"` 고정 — 기본 추천 버전이 최신 crates.io 의존성(edition2024)을 못 빌드해서                                                                                                               |
| `state.rs` 필드명      | 기존 5항 체계(`pending/allocated/disputed/paid_out/refunded`) 유지, `EscrowState` enum 신규 추가 — `packages/schema`의 `EscrowStatus`와 값 일치                                                                                   |
| `movie_id`             | PDA 시드 + 계정 필드 둘 다 저장 (PDA는 역산 불가라 조회용으로 별도 필요)                                                                                                                                                          |
| `contract_hash`        | `rule_hash`와 별도 필드 — 계약서 원문과 추출 규칙, 두 지점을 각각 증명                                                                                                                                                            |
| SBF 빌드               | `cargo build-sbf --arch v3` 필수 — 로컬 validator가 `SIMD-0500`으로 SBPF v0~v2 배포를 막아서                                                                                                                                      |
| 이슈 #7 (EscrowStatus) | 이미 충족 — `state.rs`의 `EscrowState`(Pending/Verified/Allocated/Paid/Disputed)가 `packages/schema`의 `EscrowStatus`와 정확히 대응. Anchor TS 클라이언트가 자동으로 소문자 키(`{ pending: {} }`)로 내려줘서 스키마 표기와도 맞음 |

## 구현 완료

### `init_escrow` (STAGE 0b)

- `MovieEscrow` PDA + `vault`(ATA) 생성, `movie_id`/`contract_hash`/`rule_hash`/`rule_version` 기록
- `authority`는 `Signer` — 정산 에이전트 본인이 escrow 생성에 co-sign해야 함(제3자가 동의 없이 임의 주소를 정산 권한자로 지정 못 하게). **주의(A 프론트 영향)**: 에스크로 생성 트랜잭션에 `payer` 외에 `authority` 키페어 서명이 추가로 필요해짐
- **2026-08-01 추가**: `theater: Pubkey`(이슈 #5), `mg_amount`/`investment_amount: u64`(이슈 #7 풀 워터폴 초기값) 인자 3개 추가 — **주의(A 프론트 영향)**: 계약서에 MG·투자 조항이 없으면 뒤의 두 값은 0으로 넘기면 됨
- 테스트: PDA·vault 생성, 초기값 전부 0/Pending 확인, `theater`/`mgRemaining`/`investmentRemaining`이 넘긴 값과 일치하는지 확인

### `deposit` (STAGE 1)

- 관객 USDC → vault SPL transfer, `gross_in`/`pending` 증가, `DepositEvent` emit
- **이슈 #8 해결(부분, 7/31)**: `screening_id: String`, `seat: String` 인자 추가 + `DepositEvent`에 실어 emit, `timestamp`를 `Clock::unix_timestamp * 1000`으로 ms 단위 전환. D의 `hashTicketEvent`(`apps/agent/src/risk-check/hash.ts`)가 기대하는 `TicketEvent` 원천 필드(kind/screeningId/seat/amount/timestamp)를 채우는 것이 목적 — 실제 해시(prevHash 포함)는 온체인이 아니라 D가 이벤트 로그를 순서대로 읽어 오프체인에서 계산함 (프로그램은 자기 트랜잭션 서명을 알 방법이 없어 애초에 온체인 계산이 불가능)
- **주의(A 프론트 영향)**: `deposit` 호출 시 `screening_id`/`seat` 인자가 추가로 필요함
- **2026-08-01 — 0원 무료 발권 허용(이슈 #8 잔여, 팀 결정)**: `require!(amount > 0)` 제거, `amount == 0`이면 SPL transfer 자체를 생략(아래 상세)
- 테스트: 단건/누적 입금, 0원 허용(무료 발권)

### `refund_pending` (STAGE 1, 격리 불변식 ③)

- 자기 서비스 환불 — 본인 소유 ATA로만 수취 가능하게 제약
- escrow PDA 서명 CPI로 vault → 관객 반환, `pending -= amount`(초과 시 자동 거부), `refunded += amount`
- `deposit`과 동일하게 `screening_id`/`seat` 추가 + `timestamp` ms 전환 (이슈 #8)
- 테스트: 정상 환불, 초과 환불 거부, 타인 계정 환불 거부

### `verify_escrow` (STAGE 3→2 게이트)

- D의 STAGE 3 위험조정검증 통과를 온체인에 기록 — `Pending → Verified` 전환만 담당
- `guards::require_state`로 `settle_batch`가 `Verified` 상태만 받아들이도록 가드
- `has_one = authority`로 escrow.authority 본인만 호출 가능
- 테스트: 타인 호출 거부, 정상 전환, 이미 Verified인 상태에서 재호출 거부

### `settle_batch` (STAGE 2, 풀 워터폴 + 회차 단위 재설계)

- 팀 결정: 계산 위치는 **온체인**(Rust에서 직접 나눗셈·반올림), 워터폴 깊이는 **풀 구현**(부과금→VAT→부율 분할→배급수수료→MG 상환→투자 상환→이익 배분, 이슈 #7 — 계약서에 MG·투자·이익분배율이 모두 들어가기로 확정되면서 초기 축소판에서 승격)
- 순서: 부과금(가액÷1.03×3%, 반올림) → VAT(잔액÷11, 내림) → 부율 분할(`theater_bps`/`distributor_bps`, 합 10000 강제) → 배급수수료(`distribution_fee_bps`, 배급 몫에서 공제) → **MG 상환**(`escrow.mg_remaining` 한도까지, 상환분은 Distributor 몫에 가산) → **투자 상환**(`escrow.investment_remaining` 한도까지, 상환분은 Investor 몫에 가산) → **이익 배분**(남는 금액을 `investor_profit_bps`로 Investor/Producer 분배)
- 부과금·VAT는 어떤 Allocation에도 안 묶이는 통계상 지급으로 보고 `pending → paid_out` 직행, 나머지 4개 몫(Theater/Distributor/Producer/Investor)은 `pending → allocated` + 각각의 Allocation PDA로. Investor Allocation은 이제 항상 생성됨(투자자 없는 영화는 `mg_amount`/`investment_amount`/`investor_profit_bps`를 0으로 넘기면 claimable이 계속 0일 뿐 문제 없음)
- 규칙 파라미터(`*_bps` 4개)는 인자로 받아 `rule_hash`와 대조해 검증(이슈 #6 후속, 아래 상세) — `mg_remaining`/`investment_remaining`의 초기값(계약 총액)은 `init_escrow`에서 한 번만 설정되고 이 검증 대상이 아님(재호출마다 다시 넘어오는 값이 아니라 계정에 고정 저장)
- **이슈 #6 해결(7/31)**: 시그니처를 `settle_batch(screening_id: String, amount: u64, theater_bps, distributor_bps, distribution_fee_bps, investor_profit_bps)`로 변경 — 더 이상 `escrow.pending` 전체를 한 번에 처리하지 않고, D가 회차 하나가 끝날 때마다 그 회차 순매출(`amount`)만 넘겨 호출한다.
  - Allocation PDA 4개(Theater/Distributor/Producer/Investor)를 `init` → `init_if_needed`로 바꿔서 같은 영화의 여러 회차 몫이 같은 계정에 누적되게 함 (`anchor-lang` `init-if-needed` 피처 추가)
  - `escrow.state`는 `Verified`(첫 회차) 또는 `Allocated`/`Disputed`(이후 회차·분쟁 중에도 새 회차 정산 가능)에서 호출 허용 — `mark_disputed`와 같은 다중 상태 허용 패턴
  - `bind_beneficiary` 헬퍼로 Theater/Distributor/Producer/Investor 지갑이 회차마다 같은 주소인지 검증 — 다른 지갑이 들어오면 조용히 수취인이 바뀌는 대신 즉시 거부
  - "보류" 판정 회차는 D가 이 instruction을 아예 안 부르거나(자금은 pending에 남음), 부른 직후 바로 `mark_disputed`로 방금 나온 배분액만 얼림 — C의 `mark_disputed`/`resolve_dispute`는 이미 이 순서에 맞게 동작해서 변경 없음
  - `screening_id`는 온체인 계정에는 저장하지 않고 `SettledEvent`에만 실어서 D의 로그 추적용으로만 씀 — PDA·계정 구조를 늘릴 필요가 없어짐
  - `SettledEvent`에 `mg_recoup`/`investment_recoup`/`investor_profit` 필드 추가 — D가 워터폴 각 단계를 감사할 수 있게 함
- 테스트: Pending 상태 거부, bps 합 100% 아닐 때 거부, `amount > pending` 거부, 타인 호출 거부, 단건 정산 시 손 계산값과 온체인 결과 일치 + 불변식① 확인, **회차 2개 연속 호출 시 Allocation에 정확히 누적되는지**, **회차마다 다른 지갑을 넣으면 거부되는지**, **MG·투자 상환 후 이익분배가 정확히 맞물려 도는지** — 총 18개 전부 통과

### `authority` 서명 검증

- `init_escrow.rs`의 `authority: UncheckedAccount` → `authority: Signer`로 변경. C의 `verify_escrow`/`settle_batch`/`mark_disputed`/`resolve_dispute`는 전부 이미 `has_one = authority` + `Signer<'info>` 패턴이라 문제없었고, 유일하게 빠져 있던 지점이 `init_escrow`였음
- 영향받는 테스트 5개 파일(`init_escrow`/`deposit`/`refund_pending`/`verify_escrow`/`settle_batch`) 전부 `initEscrow(...).signers([authority])` 추가해서 갱신, 14개 전부 통과 확인

### `rule_hash` 온체인 검증 (STAGE 2, 이슈 #6 후속)

- 결정(A·B·D, 2026-08-01): `SettlementRule` 전체가 아니라 `settle_batch`가 실제로 받는 온체인 숫자(`rule_version`, `theater_bps`, `distributor_bps`, `distribution_fee_bps`, `investor_profit_bps` — 풀 워터폴 구현 후 5개로 확정)만 검증 대상으로 좁힘 — 조항 원문·충돌·승인 여부 등은 이 instruction 인자로 안 넘어와서 애초에 재현 불가능
- 인코딩: `sha256("{rule_version}|{theater_bps}|{distributor_bps}|{distribution_fee_bps}|{investor_profit_bps}")` — `apps/agent/src/risk-check/hash.ts`의 `TicketEvent` 해시체인과 동일한 "필드를 `\|`로 join 후 sha256" 방식(JSON 직렬화의 키 순서·숫자 표현 불일치 위험 회피)
- `settle_batch.rs`: bps 검증 직후 위 공식으로 재계산한 해시를 `escrow.rule_hash`와 대조, 불일치 시 기존에 정의만 돼 있던 `EscrowError::RuleHashMismatch` 반환
- A용 헬퍼: `apps/web/src/lib/hash.ts`의 `computeRuleHash({ ruleVersion, theaterBps, distributorBps, distributionFeeBps, investorProfitBps })` — `init_escrow` 호출 전에 계산해서 `ruleHash` 인자로 넘기면 됨
- 테스트: `tests/settle_batch.test.ts`가 더미 `rule_hash`(`fill(2)`)를 쓰고 있어서 새 검증에 다 걸릴 뻔한 걸 실제 bps 기반 해시로 교체

### `dispute_count`·`theater` 필드 (이슈 #5 완결)

- 결정: 상영관 이력의 분쟁 횟수는 D가 `mark_disputed` 이벤트를 오프체인에서 집계하는 대신, `MovieEscrow.dispute_count: u32` 계정 필드로 결정 — D가 `getProgramAccounts(theater memcmp)`로 계정을 찾아 필드값만 합산하면 되고, RPC 로그 보존 기간 제약 없이 항상 최종 값을 바로 읽을 수 있음
- `mark_disputed.rs`: `escrow.disputed` 갱신 직후 `dispute_count`도 함께 `+1` (기존 `settle_batch.rs`의 `batch_count` 증가 패턴과 동일). `resolve_dispute`로 분쟁이 풀려도 감소하지 않는 누적 이력 카운터
- `anomalyCount`는 이번에 구현하지 않음 — `mark_disputed`처럼 확실한 온체인 트리거가 없어서(위험조정검증 임계 초과는 지금 100% partial-hold로 이어지지만, `judge/index.ts`의 TODO인 "임계 미달 이상 패턴 Gemini 플래그"가 생기면 그 신호는 mark_disputed를 안 거침) 이 기능이 생기기 전까지는 D의 오프체인 risk-check 결과 저장소에만 남기기로 함
- **`theater: Pubkey` 필드도 함께 구현 완료** — `MovieEscrow`에 추가, `init_escrow`에서 설정. 이 필드가 있어야 `getProgramAccounts` memcmp가 가능해서, `dispute_count`와 합쳐져야 비로소 이슈 #5가 완결됨
- IDL 재생성해서 `packages/schema/idl/`에 반영

### 0원 무료 발권 (이슈 #8 잔여 항목, 팀 결정)

- 결정: 무료 발권을 체인에 포함하기로 함 — D의 무료 발권 비율(P3) 검증이 온체인 데이터로 잡히려면 무료 티켓도 `TicketEvent`(amount=0)로 로그에 남아야 하기 때문
- `deposit.rs`: `require!(amount > 0, ...)` 제거. `amount == 0`이면 SPL `token::transfer` CPI 자체를 생략(무의미한 0-lamport 이체를 안 함) — 이벤트는 그대로 emit되어 D의 P3 검증이 정상 동작
- 테스트: `tests/deposit.test.ts`의 "rejects a zero-amount deposit"를 "accepts a zero-amount deposit"로 교체 — gross_in/pending/vault 잔액이 그대로 유지되는지 확인

### `settle_batch` 풀 워터폴 (이슈 #7)

- 결정: 계약서에 MG(미니멈 개런티)·투자·이익분배율이 모두 들어가기로 확정되면서, 초기 축소판(부과금→VAT→부율 분할→배급수수료→잔액 전액 Producer)에서 풀 워터폴로 승격
- `MovieEscrow`에 `mg_remaining`/`investment_remaining: u64` 추가 — `init_escrow`에서 계약상 MG·투자 총액(`mg_amount`/`investment_amount` 인자)으로 초기화되고, `settle_batch`가 회차마다 그 한도까지 Producer 몫에서 상환하며 줄어듦(0이 되면 그 뒤로는 전액 이익 배분 대상)
- 순서: MG 상환(한도까지, Distributor 몫에 가산) → 투자 상환(한도까지, Investor 몫에 가산) → 이익 배분(남는 금액을 `investor_profit_bps`로 Investor/Producer 분배, 부율 분할과 동일하게 Investor 몫 먼저 계산 후 Producer가 나머지 전부)
- `investor_allocation`/`investor_wallet` 계정 추가 — Theater/Distributor/Producer와 동일하게 `init_if_needed`로 항상 생성(투자자 없는 영화는 관련 금액을 0으로 넘기면 claimable이 계속 0)
- `SettledEvent`에 `mg_recoup`/`investment_recoup`/`investor_profit` 필드 추가해 워터폴 각 단계를 D가 그대로 감사 가능
- 테스트: MG 상환 → 투자 상환 → 이익 배분이 정확히 맞물려서 손 계산값과 일치하는지 확인하는 신규 테스트 추가, 총 18개 전부 통과

## PR 이력

- #21 `feat/escrow-fund-flow → dev` — 툴체인 고정 + state.rs 스키마 확정
- #24 `feat/escrow-fund-flow → dev` — init_escrow/deposit/refund_pending 구현
- #26 `feat/escrow-fund-flow → dev` — CI `npm ci` lockfile 불완전 문제 수정
- #27 `feat/escrow-fund-flow → dev` — verify_escrow 구현 (STAGE 3→2 게이트)
- #28 `feat/escrow-fund-flow → dev` — Allocation 구조체 필드 확장 관련 주석 추가 (D 확인 반영)
- #29 `feat/escrow-fund-flow → dev` — settle_batch 구현 (축소 워터폴)
- #30 `feature/claim → dev` — C: claim/mark_disputed/resolve_dispute 구현 + Allocation.disputed
- #36 `feat/escrow-fund-flow → dev` — authority 서명 검증(init_escrow) + settle_batch 회차 단위 재설계(이슈 #6) + deposit/refund_pending 해시체인 필드 추가(이슈 #8), 머지 완료 (2026-08-01)
- (다음 PR) `feat/escrow-fund-flow → dev` — rule_hash 온체인 검증(이슈 #6 후속) + dispute_count·theater 필드(이슈 #5 완결) + 0원 무료 발권(이슈 #8 완결) + settle_batch 풀 워터폴(이슈 #7)

## 다음 할 일

1. **새 PR 생성 필요** — 오늘 진행분(rule_hash 검증, dispute_count·theater 필드, 0원 무료 발권, 풀 워터폴) 커밋이 `feat/escrow-fund-flow`에 있는데 아직 PR이 없음 (gh CLI 미인증)
2. **D에게 전달 필요**: `init_escrow`/`settle_batch` 시그니처가 또 바뀜 — `theater`/`mg_amount`/`investment_amount`(init_escrow), `investor_profit_bps`+`investor_allocation`/`investor_wallet` 계정(settle_batch). `dispute_count`+`theater` 필드가 다 갖춰져서 `getProgramAccounts(theater memcmp)` 상영관 이력 집계가 이제 실제로 가능함
3. **A에게 전달 필요**: `computeRuleHash()`에 `investorProfitBps` 인자가 추가됨. `init_escrow` 호출 시 `theater`/`mg_amount`/`investment_amount`도 추가로 필요(MG·투자 없으면 0). 무료 티켓 버튼은 `deposit(amount=0)`으로 그대로 호출하면 됨
4. `docs/ponyo_work/DEADLINE.md`(D, 7/31 D-3 항목)의 **Devnet 배포**는 아직 localnet만 해놓은 상태 — `Anchor.toml` 주석("Devnet 이전은 8/1 이후")과 상충하니 팀 확인 필요
5. GitHub 이슈 #5, #6, #7, #8, #17 코멘트/종료 처리 — gh 인증되면 README·SCHEMA_CONTRACT.md 내용 옮기면 됨 (#7·#17은 이미 충족 확인함, 닫기만 하면 됨)
