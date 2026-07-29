# 공통 스키마 계약 관리 가이드

> Owner: D 박세령  
> Reviewers: A 진규빈 · B 정서윤 · C 최상아  
> 코드 기준: [`packages/schema/src/index.ts`](../packages/schema/src/index.ts)

이 문서는 화면, 정산 에이전트, Anchor 프로그램이 주고받는 데이터의 공통 규칙과
변경 절차를 정의한다. D는 스키마를 정리하고 통합하는 관리자이며, 각 파트의
도메인 규칙을 혼자 결정하지 않는다.

## 1. 관리 원칙

- 공통 스키마는 `packages/schema/src/index.ts`를 단일 기준으로 사용한다.
- 화면 전용 표현과 체인 원본 데이터를 구분한다.
- 필드명, 타입, 단위, 상태값, 필수 여부를 함께 정의한다.
- 공통 타입 변경은 A·B·C·D 전원의 영향을 확인한다.
- 확정되지 않은 값은 임의로 고정하지 않고 이 문서의 미결정 사항에 기록한다.
- TypeScript 타입 검사만 믿지 않고 실제 API 응답과 IDL도 계약 테스트로 검증한다.

## 2. 현재 공통 규칙

| 항목               | 현재 규칙                                  | 상태                       |
| ------------------ | ------------------------------------------ | -------------------------- |
| TypeScript 필드명  | `camelCase`                                | ✅ 적용 중                 |
| Rust 필드명        | `snake_case`                               | ✅ 적용 중                 |
| 금액               | USDC 최소 단위 정수, 1 USDC = `1_000_000`  | ⚠️ 웹 목업 정리 필요       |
| 비율               | 0~1 사이의 `number`                        | ✅ 적용 중                 |
| 시간               | Unix milliseconds                          | ✅ 적용 중                 |
| 주소·트랜잭션 서명 | `string`                                   | ✅ 적용 중                 |
| API 오류           | `{ error: { code, message, requestId } }`  | ✅ 에이전트 적용 중        |
| 값이 없는 필드     | 의미상 값이 없으면 `null`, 선택 정보는 `?` | ⚠️ 팀 확인 필요            |
| 온체인 `u64` 전달  | 현재 `number`                              | ⚠️ `string` 전환 검토 필요 |

JavaScript의 `number`는 `Number.MAX_SAFE_INTEGER`보다 큰 정수를 정확하게 표현하지
못한다. 실제 온체인 잔액과 누적액을 연결하기 전에 금액 타입을 문자열로 바꿀지
결정해야 한다.

```ts
// 검토안
type UsdcAmount = string; // "32700000" = 32.7 USDC
```

화면 표시 변환은 UI 경계에서만 수행한다.

```text
API·에이전트·체인: 32700000
화면 표시: 32.7 USDC
```

## 3. 정산 상태

현재 공통 타입:

```ts
type EscrowStatus = "pending" | "verified" | "allocated" | "paid" | "disputed";
```

기본 상태 전이 초안:

```text
pending ── 검증·귀속 ──> allocated ── claim 완료 ──> paid
   │                         │
   └── 이상 발견 ─────────> disputed
                              │
                              ├── 승인·재귀속 ──> allocated
                              └── 반려·환불 ───> refunded 금액 반영
```

`refunded`는 현재 누적 금액 필드이며 `EscrowStatus`는 아니다.

### ⚠️ 팀이 결정해야 하는 상태 규칙

1. 정상분과 보류분이 동시에 있으면 전체 snapshot 상태를 `disputed`로 볼 것인가?
2. `verified`를 영속 상태로 저장할 것인가, 처리 중 단계로만 사용할 것인가?
3. 일부 권리자만 claim한 경우 `allocated`와 `paid` 중 무엇으로 표시할 것인가?
4. 분쟁 금액이 환불되면 별도 `refunded` 상태가 필요한가?

현재 에이전트는 보류액이 하나라도 있으면 snapshot을 `disputed`로 반환한다. 웹
목업은 동일한 상황을 `allocated`로 표시하므로 통합 전에 합의가 필요하다.

## 4. TypeScript ↔ Anchor 대응

| 공통 스키마/API | Anchor                | 변환 책임      | 상태               |
| --------------- | --------------------- | -------------- | ------------------ |
| `grossIn`       | `gross_in: u64`       | D ChainGateway | 골격 존재          |
| `pending`       | `pending: u64`        | D ChainGateway | 골격 존재          |
| `allocated`     | `allocated: u64`      | D ChainGateway | 골격 존재          |
| `disputed`      | `disputed: u64`       | D ChainGateway | 골격 존재          |
| `paidOut`       | `paid_out: u64`       | D ChainGateway | 골격 존재          |
| `refunded`      | `refunded: u64`       | D ChainGateway | 골격 존재          |
| `ruleHash`      | `rule_hash: [u8; 32]` | A·B·D 합의     | 인코딩 미확정      |
| `version`       | `rule_version: u16`   | A·B·D 합의     | 명칭 대응          |
| `role`          | `BeneficiaryRole`     | B·D 어댑터     | enum 대응 필요     |
| `address`       | `Pubkey`              | D ChainGateway | base58 문자열 변환 |
| `txSignature`   | 트랜잭션 서명         | D ChainGateway | Stub 사용 중       |

Rust의 `snake_case`를 API의 `camelCase`로 바꾸고 `u64`, `Pubkey`, 바이트 배열을
JSON 형식으로 변환하는 책임은 D의 ChainGateway 어댑터에 둔다.

## 5. 파트별 책임

### A 진규빈 — 화면 계약

- 화면에서 필요한 필드와 표시 상태 정의
- 로딩, 오류, 빈 데이터 처리
- 최소 단위 금액을 사람이 읽는 USDC로 변환
- 모든 `EscrowStatus`와 `Verdict` 표시 지원

### B 정서윤 — 자금 흐름 계약

- 에스크로·Allocation 계정 필드
- `init_escrow`, `deposit`, `refund_pending`, `settle_batch` 입출력
- 금액 불변식과 권리자별 배분 결과
- Anchor IDL 제공

### C 최상아 — 판정 집행 계약

- `claim`, `mark_disputed`, `resolve_dispute` 입출력
- 허용되는 상태 전이와 오류
- 트랜잭션 이벤트와 분쟁 처리 결과

### D 박세령 — Schema Owner / Integration Lead

- 각 파트의 요구를 공통 타입으로 정리
- API 응답과 오류 형식 관리
- TypeScript ↔ Anchor 변환 계층 관리
- 변경 영향 확인 및 리뷰 요청
- 계약 테스트와 전체 통합 검증

## 6. 변경할 때 같이 볼 파일

| 확인 대상    | 파일                                      | 확인할 내용                   |
| ------------ | ----------------------------------------- | ----------------------------- |
| 공통 타입    | `packages/schema/src/index.ts`            | 필드, 타입, 단위, 상태        |
| 웹 목업      | `apps/web/src/mocks/demo.ts`              | 공통 타입과 단위 준수         |
| 웹 소비 코드 | `apps/web/src/pages/`                     | 모든 상태·빈 값 처리          |
| API 응답     | `apps/agent/src/routes/`                  | 실제 JSON 구조                |
| 상태 계산    | `apps/agent/src/store.ts`                 | 불변식과 snapshot 상태        |
| 판정 결과    | `apps/agent/src/judge/`                   | `JudgeDecision` 생성          |
| 체인 어댑터  | `apps/agent/src/chain/gateway.ts`         | TS↔Rust 변환                  |
| Anchor 계정  | `programs/movie_escrow/src/state.rs`      | 필드와 정수 타입              |
| Anchor 명령  | `programs/movie_escrow/src/instructions/` | 입출력·상태 전이              |
| 생성 IDL     | `packages/schema/idl/`                    | 실제 instruction·account 구조 |

스키마를 바꿀 때는 이름이 같은 파일만 검색하지 말고 기존 필드 사용처를 전체
검색한다.

```bash
rg "DashboardSnapshot|EscrowStatus|변경할필드명" \
  apps packages programs
```

## 7. AI에 맡길 일과 직접 할 일

### AI에 맡기기 좋은 일

- TypeScript와 Rust 필드 차이 검색
- 스키마 사용처와 영향 파일 목록 만들기
- 반복적인 타입·필드명 변경
- API 응답 fixture와 계약 테스트 초안 작성
- 상태 전이표와 TS↔Rust 대응표 갱신
- 누락된 enum 처리와 exhaustive check 탐색
- IDL과 TypeScript 인터페이스의 기계적 비교
- lint, typecheck, test 실행 및 실패 원인 후보 정리

AI에 요청할 때는 범위를 구체적으로 준다.

```text
packages/schema/src/index.ts를 기준으로 웹 목업, Agent API, Anchor state의
필드명·타입·단위 불일치를 찾아줘. 코드는 수정하지 말고 파일/줄/영향만 표로
정리해줘.
```

### 세령이가 직접 결정해야 하는 일

- 실제 제품에서 필요한 정보와 필요하지 않은 정보
- 상태가 무엇을 의미하고 언제 전이되는지
- 돈의 단위와 반올림·정밀도 정책
- 어떤 오류를 재시도할 수 있는지
- 개인정보·지갑 주소·계약 원문을 어디까지 공개할지
- A·B·C 의견이 충돌할 때 최종 합의안
- 호환성을 깨는 변경을 지금 적용할지 미룰지
- AI가 제안한 변경이 계약과 실제 자금 흐름에 맞는지 승인

핵심 원칙은 다음과 같다.

> AI는 차이를 찾고 반복 작업을 수행한다. 사람은 의미, 돈, 상태, 권한을 결정한다.

## 8. 변경 절차

1. **현황 조사:** 타입과 모든 사용처, Anchor state·IDL을 함께 확인한다.
2. **문제 기록:** 현재 값, 제안 값, 변경 이유, 영향 파트를 적는다.
3. **담당자 확인:** A는 화면, B는 자금, C는 분쟁, D는 API 관점으로 리뷰한다.
4. **결정 기록:** 결정자와 결정 내용을 이 문서의 변경 기록에 남긴다.
5. **스키마 변경:** `packages/schema`를 먼저 수정한다.
6. **각 파트 적용:** 웹 목업, Agent API, ChainGateway, Anchor를 맞춘다.
7. **계약 테스트:** 정상·오류·경계값과 금액 불변식을 검증한다.
8. **전체 검사:** `npm run check` 및 Anchor 테스트를 실행한다.
9. **PR 리뷰:** 공통 스키마 변경임을 표시하고 전원 리뷰를 받는다.

## 9. PR에 반드시 적을 내용

```md
## Schema change

- 변경 이유:
- 변경 전/후:
- 금액·시간 단위:
- 호환성 파괴 여부:
- 영향: Web / Agent / Anchor / IDL
- 담당자 확인: A [ ] B [ ] C [ ] D [ ]
- 테스트:
- 미결정 사항:
```

## 10. 계약 테스트 완료 기준

- [ ] 웹 목업이 공통 스키마와 동일한 금액 단위를 사용한다.
- [ ] `/api/snapshot` 실제 응답을 런타임 스키마로 검증한다.
- [ ] `grossIn = pending + allocated + disputed + paidOut + refunded`가 유지된다.
- [ ] 화면이 모든 `EscrowStatus`와 `Verdict`를 처리한다.
- [ ] 큰 `u64` 금액을 왕복해도 값이 손상되지 않는다.
- [ ] 실제 IDL의 account·instruction이 ChainGateway 기대값과 일치한다.
- [ ] 정상 지급, 부분 보류, 분쟁 해결, 환불 시나리오를 각각 검증한다.
- [ ] 오류 응답에 `code`, `message`, `requestId`가 존재한다.

## 11. 현재 미결정·불일치 사항

| 항목           | 현재 상태                              | 필요한 결정             | 확인 담당 |
| -------------- | -------------------------------------- | ----------------------- | --------- |
| 웹 금액        | `32.7` 등 표시 단위를 타입 값으로 사용 | 최소 단위 정수로 통일   | A·D       |
| snapshot 상태  | 웹 `allocated`, Agent `disputed`       | 혼합 상태 표시 규칙     | A·C·D     |
| 권리자 잔액    | Agent `balances: []`                   | 워터폴 결과 구조        | B·D       |
| 금액 타입      | TypeScript `number`, Anchor `u64`      | `string` 전환 여부      | B·D       |
| `verified`     | 타입에만 존재                          | 영속 상태 여부          | B·C·D     |
| `ruleHash`     | TS hex 문자열, Rust `[u8; 32]`         | 인코딩·검증 방식        | A·B·D     |
| 실제 체인 결과 | Stub signature                         | IDL 기반 gateway        | B·C·D     |
| 분쟁 해결 결과 | 구조 미정                              | 승인·반려 응답과 이벤트 | C·D       |

## 12. 변경 기록

| 날짜       | 변경                               | 상태         |
| ---------- | ---------------------------------- | ------------ |
| 2026-07-30 | 현재 코드 기반 계약 관리 초안 작성 | 팀 리뷰 대기 |
