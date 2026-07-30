# B 정서윤 작업 정리

> 담당: **B — 체인·자금흐름 / 정서윤**
> 범위: `init_escrow` · `deposit` · `refund_pending` · `settle_batch` (STAGE 0b·1·2)
> 브랜치: `feat/escrow-fund-flow`

## 현재 상태 — 2026-07-30

- ✅ 완료: `init_escrow`, `deposit`, `refund_pending` 구현 + 테스트 통과 + `dev` merge 완료
- ✅ 완료: `verify_escrow` 구현 — STAGE 3→2 게이트(Pending → Verified), `dev` merge 완료 (PR #27)
- ✅ 완료: CI `npm ci` lockfile 불완전 문제 수정 (PR #26)
- ✅ 완료: D와 `Allocation` 출력 구조 합의 — 필드 추가 불필요, 역할별(최대 4개) PDA를 `[b"allocation", movie_id, role_byte]` 시드로 조회 (커밋 e11555b)
- ✅ 완료: `settle_batch` 구현(축소 워터폴) + 테스트 통과 + localnet 배포 확인
- ⬜ 미완료: `authority` 서명 검증 (C 담당 instruction들과 공유되는 문제)

## 결정 사항

| 항목              | 결정                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Anchor 툴체인     | `Anchor.toml`에 `solana_version = "4.1.1"` 고정 — 기본 추천 버전이 최신 crates.io 의존성(edition2024)을 못 빌드해서                             |
| `state.rs` 필드명 | 기존 5항 체계(`pending/allocated/disputed/paid_out/refunded`) 유지, `EscrowState` enum 신규 추가 — `packages/schema`의 `EscrowStatus`와 값 일치 |
| `movie_id`        | PDA 시드 + 계정 필드 둘 다 저장 (PDA는 역산 불가라 조회용으로 별도 필요)                                                                        |
| `contract_hash`   | `rule_hash`와 별도 필드 — 계약서 원문과 추출 규칙, 두 지점을 각각 증명                                                                          |
| SBF 빌드          | `cargo build-sbf --arch v3` 필수 — 로컬 validator가 `SIMD-0500`으로 SBPF v0~v2 배포를 막아서                                                    |

## 구현 완료

### `init_escrow` (STAGE 0b)

- `MovieEscrow` PDA + `vault`(ATA) 생성, `movie_id`/`contract_hash`/`rule_hash`/`rule_version` 기록
- `authority`는 주소만 저장 (서명 검증은 TODO)
- 테스트: PDA·vault 생성, 초기값 전부 0/Pending 확인

### `deposit` (STAGE 1)

- 관객 USDC → vault SPL transfer, `gross_in`/`pending` 증가, `DepositEvent` emit
- 테스트: 단건/누적 입금, 0원 거부

### `refund_pending` (STAGE 1, 격리 불변식 ③)

- 자기 서비스 환불 — 본인 소유 ATA로만 수취 가능하게 제약
- escrow PDA 서명 CPI로 vault → 관객 반환, `pending -= amount`(초과 시 자동 거부), `refunded += amount`
- 테스트: 정상 환불, 초과 환불 거부, 타인 계정 환불 거부

### `verify_escrow` (STAGE 3→2 게이트)

- D의 STAGE 3 위험조정검증 통과를 온체인에 기록 — `Pending → Verified` 전환만 담당
- `guards::require_state`로 `settle_batch`가 `Verified` 상태만 받아들이도록 가드
- `has_one = authority`로 escrow.authority 본인만 호출 가능
- 테스트: 타인 호출 거부, 정상 전환, 이미 Verified인 상태에서 재호출 거부

### `settle_batch` (STAGE 2, 축소 워터폴)

- 팀 결정: 계산 위치는 **온체인**(Rust에서 직접 나눗셈·반올림), 워터폴 깊이는 **축소**(부과금→VAT→부율 분할→배급수수료까지만; MG 상환·투자 상환·이익 배분은 핸들러 하단에 주석으로만 남김 — 재개 시 언급해줄 것)
- 순서: 부과금(가액÷1.03×3%, 반올림) → VAT(잔액÷11, 내림) → 부율 분할(`theater_bps`/`distributor_bps`, 합 10000 강제) → 배급수수료(`distribution_fee_bps`, 배급 몫에서 공제) → 잔액 전액 Producer
- 부과금·VAT는 어떤 Allocation에도 안 묶이는 통계상 지급으로 보고 `pending → paid_out` 직행, 나머지 3개 몫은 `pending → allocated` + Theater/Distributor/Producer Allocation PDA(`init`) 생성. Investor Allocation은 축소판에서 몫이 항상 0이라 아예 만들지 않음
- 규칙 파라미터(`*_bps`)는 인자로 받아 authority 서명만으로 신뢰 — `rule_hash` 대조 검증은 SettlementRule 인코딩 방식이 아직 B·D 간 미확정(`docs/SCHEMA_CONTRACT.md` §11)이라 TODO로 남김
- 테스트: Pending 상태에서 호출 거부, bps 합 100% 아닐 때 거부, 타인 호출 거부, 정상 실행 시 손 계산값과 온체인 결과 일치 + 불변식① 확인

## PR 이력

- #21 `feat/escrow-fund-flow → dev` — 툴체인 고정 + state.rs 스키마 확정
- #24 `feat/escrow-fund-flow → dev` — init_escrow/deposit/refund_pending 구현
- #26 `feat/escrow-fund-flow → dev` — CI `npm ci` lockfile 불완전 문제 수정
- #27 `feat/escrow-fund-flow → dev` — verify_escrow 구현 (STAGE 3→2 게이트)
- #28 `feat/escrow-fund-flow → dev` — Allocation 구조체 필드 확장 관련 주석 추가 (D 확인 반영)
- (다음 PR) `feat/escrow-fund-flow → dev` — settle_batch 구현 (축소 워터폴)

## 다음 할 일

1. `authority` 서명 검증 — C와 공동 설계 필요
2. `settle_batch` 풀 워터폴(MG 상환·투자 상환·이익 배분) — `MovieEscrow`에 `mg_remaining`/`investment_remaining` 필드 추가 필요, 지금은 `settle_batch.rs` 핸들러 하단에 주석으로만 위치 표시해둠
3. `rule_hash` 온체인 검증 — SettlementRule → 해시 인코딩 방식 B·D 합의 필요 (`docs/SCHEMA_CONTRACT.md` §11), 합의되면 `settle_batch`의 `*_bps` 인자를 해시 대조로 검증하도록 보강
4. `docs/SCHEMA_CONTRACT.md` §11 "권리자 잔액"·`ruleHash` 행 — 위 결정들 반영해 갱신 필요
