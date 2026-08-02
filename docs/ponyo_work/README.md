# D 박세령 작업 정리

> 담당: **D — 에이전트·판단 로직 / 박세령**
>
> 기준 문서: `REQ-INDIE-001 v0.2`, `SPEC-INDIE-002 v0.5`,
> `PLAN-INDIE-003 v0.4`
>
> 폐기된 `docs/team/TEAM_PLAN.md`와 2026-07-30 재작성 이전 Product Brief는 역할
> 판단의 기준으로 사용하지 않는다. 현재 `docs/PRODUCT_BRIEF.md`는 유효한 요약
> 문서다.

## 현재 상태 — 2026-07-30

- ✅ 완료: 로컬 로직·API·테스트까지 구현
- 🟡 연결 대기: 인터페이스와 stub은 구현됐지만 실제 외부 시스템은 미연결
- ⬜ 미완료: 아직 구현·설정하지 않음

현재 `feature/agent-settlement-pipeline`의 타입 검사가 통과하고 테스트 13개가 모두
통과한다. STAGE 3·4는 fixture와 stub으로 완주하지만 Solana, Gemini와 Cloud
서비스는 아직 실제 연결되지 않았다.

## D의 목표

정산 에이전트가 사람 개입 없이 온체인 발권·환불 이력을 검증하고, 정상 정산과
부분 보류를 판단한 뒤 B·C가 만든 에스크로 프로그램을 호출하도록 완성한다. 판단
결과와 근거는 A의 대시보드에 전달하고, 최종 서비스는 Cloud Run 라이브 URL에서
실행한다.

GCP 서비스의 의미, 실제 배포 순서, Secret과 IAM 보안, A 웹 연결 방식은
[GCP 배포 이해 가이드](GCP_DEPLOYMENT_GUIDE.md)에 정리되어 있다.

```text
배치 트리거
  → 온체인 이력 조회
  → 위험 임계값 조정
  → 정합성 검증
  → 진행 / 부분 보류 판단
  → B settle_batch / C mark_disputed 호출
  → 판단 로그 API
  → A 대시보드
```

## 1. D 직접 담당

### STAGE 3 — 위험조정검증

- [ ] 같은 상영관의 과거 정산 배치를 Solana RPC로 조회한다.
- [ ] 정산 규모, 이상 탐지 횟수와 분쟁 이력을 집계한다.
- [x] 신규 상영관에는 더 보수적인 임계값을 적용한다.
- [x] 환불률 상한을 검사한다. 기본값은 10%다.
- [x] 무료 발권 비율 상한을 검사한다. 기본값은 15%다.
- [x] 발권 수가 회차 좌석 수를 초과하는지 검사한다.
- [x] 발권·환불 이벤트의 해시 연속성을 검사한다.
- [x] 네 검사의 측정값, 임계값과 통과 여부를 결과에 포함한다.
- [x] Phase 1에서는 외부 유료 데이터 없이 전체 검증이 끝나야 한다.

🟡 과거 이력 provider 인터페이스와 fixture 구현은 완료했다. 실제
`getProgramAccounts` 집계는 B·C의 IDL 확정 후 연결한다.

### STAGE 4 — 정산 실행 판단

- [x] 검증 결과를 `proceed` 또는 `partial-hold`로 판정한다.
- [x] 이상이 발생한 회차·금액만 보류하도록 보류액을 계산한다.
- [x] 판정에 사용한 계약 조항과 정책을 기록한다.
- [ ] A와 함께 Gemini 자연어 판정·보류 리포트를 연결한다.
- [x] Gemini 실패 시 리허설용 템플릿 응답으로 복구할 수 있게 한다.
- [x] 정상 판정은 B의 `settle_batch` 흐름으로 전달한다.
- [x] 보류 판정은 C의 `mark_disputed(amount)` 흐름으로 전달한다.
- [x] 판단 로그를 저장하고 A가 조회할 수 있게 한다.

🟡 `settle_batch`와 `mark_disputed`는 `ChainGateway`까지 연결됐고 현재는 가짜
트랜잭션 서명을 반환하는 stub이다. 실제 Anchor 트랜잭션 연결은 미완료다. 판단
로그도 현재 서버 메모리에만 저장된다.

### Express 백엔드와 로그 API

- [x] `/health`로 서버 상태를 확인할 수 있게 한다.
- [x] 배치 실행용 API에서 검증 → 판단 → 체인 호출을 한 번에 실행한다.
- [ ] 중복 배치 요청이 들어와도 이중 정산되지 않도록 보호한다.
- [ ] 잘못된 입력은 4xx, 내부·체인 오류는 5xx로 구분한다.
- [x] 대시보드용 스냅샷 API를 `DashboardSnapshot` 타입으로 제공한다.
- [ ] 상태, 잔액, 트랜잭션, Explorer 링크와 판단 근거를 반환한다.
- [ ] 판단과 오류가 Cloud Logging에서 추적되도록 구조화 로그를 남긴다.

🟡 상태·판단 근거·stub 트랜잭션은 반환한다. 실제 권리자별 잔액과 Explorer
트랜잭션은 B·C 체인 연동 후 완료한다.

주요 작업 위치:

- `apps/agent/src/risk-check/`
- `apps/agent/src/judge/`
- `apps/agent/src/pipeline.ts`
- `apps/agent/src/routes/`
- `apps/agent/src/chain/`
- `apps/agent/src/store.ts`
- `apps/agent/test/`

## 2. 배포·운영

### D 주담당

- [ ] 정산 에이전트용 Docker 이미지를 만든다.
- [ ] 이미지를 로컬에서 실행하고 `/health`를 확인한다.
- [ ] 정산 에이전트를 Cloud Run에 배포한다.
- [ ] Cloud Run 리전과 서비스 이름을 팀에 공유한다.
- [ ] 필요한 환경변수와 Secret 이름을 정의한다.
- [ ] Gemini 키 등 비밀값은 코드나 Git에 넣지 않고 Secret Manager로 주입한다.
- [ ] Cloud Scheduler가 호출할 인증된 배치 엔드포인트를 설정한다.
- [ ] 데모용 “정산일 도래” 버튼도 같은 배치 파이프라인을 호출하게 한다.
- [ ] 배포 URL의 CORS에 A 프론트 주소만 허용한다.
- [ ] 라이브 URL에서 결제 → 검증 → 판정 → 분배 흐름을 확인한다.
- [ ] Devnet 장애에 대비해 로컬 validator/fixture 폴백 절차를 문서화한다.

### 필요한 설정값

```env
AGENT_PORT=4030
GEMINI_API_KEY=
SOLANA_RPC_URL=
SOLANA_PROGRAM_ID=
```

실제 변수명은 구현과 합의 후 `.env.example`에 반영한다. 개인키, API 키와 지갑 JSON은
Git에 커밋하지 않는다.

## 3. 다른 담당자와 연결되는 일

### A 진규빈과 공동

- Gemini API 키 발급과 사용 프로젝트 확인
- STAGE 4 판단 프롬프트와 출력 형식 확정
- 판단 근거, 계약 조항과 보류액의 화면 표시 방식 확정
- `DashboardSnapshot` API 계약 확인
- 프론트 배포 URL과 백엔드 CORS 연결
- Gemini 실패 시 캐시·템플릿 폴백 확인

D는 판정 파이프라인과 서버 연동을 책임지고, A는 프롬프트·화면과 사용자 흐름을
책임진다.

### B 정서윤과 연결

- `MovieEscrow` 계정 구조와 필드명 확인
- 발권·환불 로그 및 과거 배치 조회 형식 확인
- 정상 판정 후 `settle_batch` 호출 입력값과 순서 확인
- IDL, Program ID와 Devnet RPC 정보 전달받기

### C 최상아와 연결

- 보류 판정 후 `mark_disputed(amount)` 호출 형식 확인
- `claim`과 `resolve_dispute` 이후 상태·로그 형식 확인
- 타인 몫 초과 인출 실패 결과가 로그 API에 표시되는지 확인

### 전원과 연결

- `packages/schema` 변경은 전원 리뷰를 받는다.
- Devnet E2E 테스트를 최소 세 번 반복한다.
- 제출용 라이브 URL과 실패 복구 절차를 공유한다.

## 4. API 키와 클라우드 책임

| 항목                      | 주담당      | D의 역할                       |
| ------------------------- | ----------- | ------------------------------ |
| Gemini API 키             | A           | STAGE 4 서버 연동, Secret 주입 |
| KOBIS API 키              | A           | 담당 없음                      |
| Firestore/Storage         | A           | 판단 로그 저장 방식 협의       |
| Solana RPC·Program ID·IDL | B·C         | 정산 에이전트에 연결           |
| Devnet 지갑·프로그램 배포 | B·C         | 호출·로그 확인                 |
| Cloud Run                 | D           | 설정, 배포, 검증               |
| Cloud Scheduler           | D           | 인증 호출과 배치 트리거 설정   |
| Secret Manager            | D           | 서버 비밀값 등록·주입          |
| 라이브 백엔드 URL         | D           | 최종 관리·공유                 |
| x402/pay.sh               | Phase 2의 D | Phase 1 완료 전 착수하지 않음  |

## 5. 작업 순서

> 여기부터의 실행 단위 백로그는 [TASKS.md](TASKS.md)에서 관리한다. 남에게 막히는
> 작업과 아닌 작업을 나눠 두었고, 막힌 항목은 GitHub 이슈 #5~#9에 등록돼 있다.

### 지금

- [x] fixture/stub으로 STAGE 3 검증을 완성한다.
- [x] `proceed`·`partial-hold` 판정과 테스트를 완성한다.
- [x] 배치 API와 판단 로그 API를 로컬에서 실행한다.
- [x] Gemini 없이 템플릿 리포트로 전체 파이프라인을 완주한다.

### B·C 인터페이스 확정 후

1. fixture 이력 조회를 실제 Solana RPC 조회로 교체한다.
2. stub 체인 호출을 실제 `settle_batch`·`mark_disputed` 호출로 교체한다.
3. 실제 IDL과 `packages/schema` 타입을 맞춘다.
4. Localnet E2E를 통과시킨다.

### 라이브 배포

1. Docker 실행을 검증한다.
2. Cloud Run에 fixture/stub 버전을 먼저 올려 `/health`를 확인한다.
3. Secret Manager와 Gemini를 연결한다.
4. Solana Devnet RPC·Program ID를 연결한다.
5. Cloud Scheduler와 데모 버튼을 연결한다.
6. A 프론트에 라이브 API URL을 전달한다.
7. Devnet 전체 흐름을 세 번 이상 반복한다.

### 시간이 남을 때만

- `checkTrustFreshness()`에 x402 신뢰도 조회를 구현한다.
- `checkRefundEvidence()`에 x402 증빙 조회를 구현한다.
- pay.sh 예산 정책과 지출 한도를 적용한다.

Phase 1 수용 기준을 모두 통과하기 전에는 Phase 2를 시작하지 않는다.

## 6. D 관련 완료 기준

### D4 — 위험조정검증

- [ ] 에이전트가 온체인 이력을 조회한다.
- [x] 이력에 따라 임계값을 조정한다.
- [x] 환불률·무료 발권·좌석·해시를 검증한다.
- [x] 사람 개입 없이 진행 또는 보류를 판정한다.

🟡 fixture 이력으로는 통과한다. 실제 온체인 이력 조회가 연결돼야 D4 전체 완료다.

### D5 — 부분 보류

- [x] 주입한 이상이 탐지된다.
- [ ] 정상 금액은 지급되고 이상 금액만 보류된다.
- [ ] Gemini 자연어 보류 리포트가 생성된다.

🟡 정상/보류 분기와 템플릿 리포트는 테스트를 통과했다. 실제 지급·격리와 Gemini
리포트 연결 후 D5 전체 완료다.

### D7 — 대시보드 연동

- [ ] 판단 결과와 근거가 A 대시보드에 표시된다.
- [ ] 상태와 트랜잭션 링크가 표시된다.
- [ ] 새로고침 후에도 필요한 상태가 복구된다.

🟡 A가 사용할 `/api/snapshot`과 `/api/screenings`는 구현됐다. 프론트 연결,
Explorer 링크와 영속 저장은 아직이다.

### 라이브 완료

- [ ] Cloud Run `/health`가 정상 응답한다.
- [ ] Scheduler 또는 데모 버튼이 배치 파이프라인을 실행한다.
- [ ] Secret이 로그와 응답에 노출되지 않는다.
- [ ] 라이브 URL에서 Devnet 트랜잭션까지 확인된다.
- [ ] 실패 시 재시도·복구 절차가 준비되어 있다.

## 7. 지금 하지 않는 일

- 원화·PG 연동
- KOBIS 연동
- Anchor instruction 자체 구현
- 메인넷 배포
- 자체 신뢰도 스코어
- Phase 1 완료 전 x402/pay.sh 구현

## 기준 문서

- [요구사항 정의서](../indie_cinema_requirements.html)
- [개발 스펙](../indie_cinema_product_spec.html)
- [최종 실행계획서](<../최종 실행계획서.html>)
- [제품 브리프](../PRODUCT_BRIEF.md)
