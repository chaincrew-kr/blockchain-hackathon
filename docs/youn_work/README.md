# B 정서윤 작업 정리

> 담당: **B — 체인·자금흐름 / 정서윤**
> 범위: `init_escrow` · `deposit` · `refund_pending` · `settle_batch` (STAGE 0b·1·2)
> 브랜치: `feat/escrow-fund-flow`

## 현재 상태 — 2026-07-30

- ✅ 완료: `init_escrow`, `deposit`, `refund_pending` 구현 + 테스트 통과 + `dev` merge 완료
- 🟡 진행 대기: `settle_batch` (D와 워터폴 출력 구조 합의 필요)
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

## PR 이력

- #21 `feat/escrow-fund-flow → dev` — 툴체인 고정 + state.rs 스키마 확정
- #24 `feat/escrow-fund-flow → dev` — init_escrow/deposit/refund_pending 구현

## 다음 할 일

1. **`settle_batch` 시작 전 D와 맞출 것**: 워터폴 결과(`Allocation` 배열) 구조가 D의 Agent가 기대하는 형태와 맞는지 (`docs/SCHEMA_CONTRACT.md` §11 "권리자 잔액" 항목 — B·D 미결정)
2. 공제 계산 위치(온체인 vs 오프체인), 워터폴 구현 깊이(풀 vs 축소) — 팀 결정 필요
3. `authority` 서명 검증 — C와 공동 설계 필요
