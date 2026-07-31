# B 정서윤 작업 정리

> 담당: **B — 체인·자금흐름 / 정서윤**
> 범위: `init_escrow` · `deposit` · `refund_pending` · `settle_batch` (STAGE 0b·1·2)
> 브랜치: `feat/escrow-fund-flow`

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
- 테스트: PDA·vault 생성, 초기값 전부 0/Pending 확인

### `deposit` (STAGE 1)

- 관객 USDC → vault SPL transfer, `gross_in`/`pending` 증가, `DepositEvent` emit
- **이슈 #8 해결(부분, 7/31)**: `screening_id: String`, `seat: String` 인자 추가 + `DepositEvent`에 실어 emit, `timestamp`를 `Clock::unix_timestamp * 1000`으로 ms 단위 전환. D의 `hashTicketEvent`(`apps/agent/src/risk-check/hash.ts`)가 기대하는 `TicketEvent` 원천 필드(kind/screeningId/seat/amount/timestamp)를 채우는 것이 목적 — 실제 해시(prevHash 포함)는 온체인이 아니라 D가 이벤트 로그를 순서대로 읽어 오프체인에서 계산함 (프로그램은 자기 트랜잭션 서명을 알 방법이 없어 애초에 온체인 계산이 불가능)
- **주의(A 프론트 영향)**: `deposit` 호출 시 `screening_id`/`seat` 인자가 추가로 필요함
- 테스트: 단건/누적 입금, 0원 거부

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

### `settle_batch` (STAGE 2, 축소 워터폴 + 회차 단위 재설계)

- 팀 결정: 계산 위치는 **온체인**(Rust에서 직접 나눗셈·반올림), 워터폴 깊이는 **축소**(부과금→VAT→부율 분할→배급수수료까지만; MG 상환·투자 상환·이익 배분은 핸들러 하단에 주석으로만 남김 — 재개 시 언급해줄 것)
- 순서: 부과금(가액÷1.03×3%, 반올림) → VAT(잔액÷11, 내림) → 부율 분할(`theater_bps`/`distributor_bps`, 합 10000 강제) → 배급수수료(`distribution_fee_bps`, 배급 몫에서 공제) → 잔액 전액 Producer
- 부과금·VAT는 어떤 Allocation에도 안 묶이는 통계상 지급으로 보고 `pending → paid_out` 직행, 나머지 3개 몫은 `pending → allocated` + Theater/Distributor/Producer Allocation PDA로. Investor Allocation은 축소판에서 몫이 항상 0이라 아예 만들지 않음
- 규칙 파라미터(`*_bps`)는 인자로 받아 authority 서명만으로 신뢰 — `rule_hash` 대조 검증은 SettlementRule 인코딩 방식이 아직 B·D 간 미확정(`docs/SCHEMA_CONTRACT.md` §11)이라 TODO로 남김
- **이슈 #6 해결(7/31)**: 시그니처를 `settle_batch(screening_id: String, amount: u64, theater_bps, distributor_bps, distribution_fee_bps)`로 변경 — 더 이상 `escrow.pending` 전체를 한 번에 처리하지 않고, D가 회차 하나가 끝날 때마다 그 회차 순매출(`amount`)만 넘겨 호출한다.
  - Allocation PDA 3개를 `init` → `init_if_needed`로 바꿔서 같은 영화의 여러 회차 몫이 같은 계정에 누적되게 함 (`anchor-lang` `init-if-needed` 피처 추가)
  - `escrow.state`는 `Verified`(첫 회차) 또는 `Allocated`/`Disputed`(이후 회차·분쟁 중에도 새 회차 정산 가능)에서 호출 허용 — `mark_disputed`와 같은 다중 상태 허용 패턴
  - `bind_beneficiary` 헬퍼로 Theater/Distributor/Producer 지갑이 회차마다 같은 주소인지 검증 — 다른 지갑이 들어오면 조용히 수취인이 바뀌는 대신 즉시 거부
  - "보류" 판정 회차는 D가 이 instruction을 아예 안 부르거나(자금은 pending에 남음), 부른 직후 바로 `mark_disputed`로 방금 나온 배분액만 얼림 — C의 `mark_disputed`/`resolve_dispute`는 이미 이 순서에 맞게 동작해서 변경 없음
  - `screening_id`는 온체인 계정에는 저장하지 않고 `SettledEvent`에만 실어서 D의 로그 추적용으로만 씀 — PDA·계정 구조를 늘릴 필요가 없어짐
- 테스트: Pending 상태 거부, bps 합 100% 아닐 때 거부, `amount > pending` 거부, 타인 호출 거부, 단건 정산 시 손 계산값과 온체인 결과 일치 + 불변식① 확인, **회차 2개 연속 호출 시 Allocation에 정확히 누적되는지**, **회차마다 다른 지갑을 넣으면 거부되는지** — 총 17개 전부 통과

### `authority` 서명 검증

- `init_escrow.rs`의 `authority: UncheckedAccount` → `authority: Signer`로 변경. C의 `verify_escrow`/`settle_batch`/`mark_disputed`/`resolve_dispute`는 전부 이미 `has_one = authority` + `Signer<'info>` 패턴이라 문제없었고, 유일하게 빠져 있던 지점이 `init_escrow`였음
- 영향받는 테스트 5개 파일(`init_escrow`/`deposit`/`refund_pending`/`verify_escrow`/`settle_batch`) 전부 `initEscrow(...).signers([authority])` 추가해서 갱신, 14개 전부 통과 확인

## PR 이력

- #21 `feat/escrow-fund-flow → dev` — 툴체인 고정 + state.rs 스키마 확정
- #24 `feat/escrow-fund-flow → dev` — init_escrow/deposit/refund_pending 구현
- #26 `feat/escrow-fund-flow → dev` — CI `npm ci` lockfile 불완전 문제 수정
- #27 `feat/escrow-fund-flow → dev` — verify_escrow 구현 (STAGE 3→2 게이트)
- #28 `feat/escrow-fund-flow → dev` — Allocation 구조체 필드 확장 관련 주석 추가 (D 확인 반영)
- #29 `feat/escrow-fund-flow → dev` — settle_batch 구현 (축소 워터폴)
- #30 `feature/claim → dev` — C: claim/mark_disputed/resolve_dispute 구현 + Allocation.disputed
- (다음 PR) `feat/escrow-fund-flow → dev` — authority 서명 검증(init_escrow) + settle_batch 회차 단위 재설계(이슈 #6) + deposit/refund_pending 해시체인 필드 추가(이슈 #8)

## 다음 할 일

1. **D에게 전달 필요(이슈 #6 답변)**: `settle_batch` 새 시그니처 `(screening_id: String, amount: u64, theater_bps: u16, distributor_bps: u16, distribution_fee_bps: u16)`. `apps/agent/src/chain/gateway.ts`의 `ChainGateway.settleBatch(screeningId, amount)` 인터페이스와 `anchor-gateway.ts`의 `callInstruction` 구현은 D 소유라 직접 수정하지 않음 — IDL은 `packages/schema/idl`에 최신 반영해뒀으니 D가 `AnchorChainGateway`를 채우면 됨
2. **D에게 전달 필요(이슈 #8 답변)**: `DepositEvent`/`RefundEvent`에 `screening_id`/`seat` 추가하고 `timestamp`를 ms로 바꿨음. 아직 결정 안 된 것 — **0원 무료 발권을 체인에 어떻게 포함할지**: 지금 `deposit`은 `require!(amount > 0)`이라 무료 티켓 자체를 로그로 못 남김 → D의 무료 발권 비율(P3) 검증이 온체인 데이터로는 항상 0%가 됨. amount=0 허용으로 바꾸면 기존 "0원 거부" 테스트도 같이 바뀌어야 해서 B 혼자 결정하지 않음
3. `settle_batch` 풀 워터폴(MG 상환·투자 상환·이익 배분) — `MovieEscrow`에 `mg_remaining`/`investment_remaining` 필드 추가 필요, 지금은 `settle_batch.rs` 핸들러 하단에 주석으로만 위치 표시해둠
4. `rule_hash` 온체인 검증 — SettlementRule → 해시 인코딩 방식 B·D 합의 필요 (`docs/SCHEMA_CONTRACT.md` §11), 합의되면 `settle_batch`의 `*_bps` 인자를 해시 대조로 검증하도록 보강
5. `docs/SCHEMA_CONTRACT.md` §11 "권리자 잔액"·`ruleHash` 행 — 위 결정들 반영해 갱신 필요
6. **A(프론트) 공유 필요**: (a) `init_escrow`가 이제 `authority` 서명을 요구함, (b) `deposit`/`refund_pending`이 이제 `screening_id`/`seat` 인자를 요구함 — 구매 웹에서 회차·좌석 정보를 넘겨야 함. IDL은 이미 최신 반영해서 `packages/schema/idl`에 올려둠
7. `docs/ponyo_work/DEADLINE.md`(D, 7/31 D-3 항목)의 **Devnet 배포**는 아직 localnet만 해놓은 상태 — `Anchor.toml` 주석("Devnet 이전은 8/1 이후")과 상충하니 팀 확인 필요
8. GitHub 이슈 #7, #17은 닫아도 됨 (위 "결정 사항"·"현재 상태" 참고)
