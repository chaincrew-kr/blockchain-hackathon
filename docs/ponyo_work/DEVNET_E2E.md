# Localnet·Devnet E2E 역할과 절차

> 기준일: 2026-08-01 · D 백엔드가 B·C의 `movie_escrow` IDL을 호출하는 기준

## 결론: Devnet은 D 혼자의 테스트가 아니다

- **B·C:** 프로그램 빌드·배포, IDL·Program ID 공유, 테스 에스크로 초기화
- **D 박세령:** Agent 서명 지갑·RPC·계정을 설정하고 `verify_escrow`,
  `settle_batch`, `mark_disputed`를 실제로 호출해 API 응답·로그·오류를 검증
- **A:** 프론트엔드에서 Agent API와 Explorer 링크·금액·상태 표시 검증
- **팀 공통:** 관객 결제 → 에스크로 → 정산 → 부분 보류 → 화면 반영 한 바퀴 리허설

즉 D가 해야 할 Devnet 테스트는 **백엔드가 실제 트랜잭션을 만들고
결과를 읽는 구간**이다. 프로그램 배포와 전체 제품 E2E까지 D가 혼자
책임지는 않는다.

## 1. 현재 연결 계약

D Agent는 `packages/schema/idl/movie_escrow.json`을 읽고 다음 순서로 호출한다.

```text
정상 회차: verify_escrow(필요 시) → settle_batch
이상 회차: verify_escrow(필요 시) → settle_batch
             → 권리자별 신규 claimable 계산
             → theater/distributor/producer/investor에 mark_disputed
```

이상 회차는 팀이 선택한 이슈 #33의 **2안**이다. 정상 지급 가능액은
`allocated`로 남고, 보류액은 각 `Allocation.disputed`에 따로 누적된다.

## 2. Localnet 검증

### B·C가 먼저 준비할 값

- Localnet에 배포한 Program ID
- 배포 결과와 일치하는 IDL
- `init_escrow`가 끝난 `movieId`
- theater, distributor, producer, investor 지갑 주소
- Agent authority가 `verify_escrow`/`settle_batch`를 호출할 권한

### D 환경변수

`.env.example`의 체인 항목을 채운다. 키페어 파일은 절대 커밋하지
않는다.

### 통과 기준

1. 기동 로그에 `chainGateway: anchor`가 나온다.
2. preflight에서 RPC, 프로그램, escrow, authority 잔액이 확인된다.
3. `POST /api/batch/trigger`가 `STUB_` 가 아닌 서명을 반환한다.
4. 정상 회차 Allocation의 `claimable`이 증가한다.
5. 이상 회차의 권리자별 `disputed`가 증가하고 `dispute_count`가 1씩
   누적된다.
6. 같은 배치를 다시 호출해도 API 멱등성으로 이중 정산되지 않는다.

## 3. Devnet 검증

Localnet 6개 기준을 모두 통과한 뒤 RPC·Program ID·계정만 Devnet 값으로
교체한다. D는 각 트랜잭션 서명을 Solana Explorer에서 확인하고, A는
같은 서명과 금액이 화면에 보이는지 확인한다.

Devnet 리허설은 최소 다음 두 회차를 포함한다.

- 정상 회차 1건: 전액 귀속
- 이상 회차 1건: 권리자별 귀속 후 부분 보류

## 4. 현재 차단 사항

현재 D 환경에는 `solana`, `anchor`, `cargo` CLI가 없어 실제 Localnet·Devnet
트랜잭션은 아직 돌리지 못했다. IDL 기반 PDA·instruction 순서는 mock RPC
계약 테스트로 검증한다. B·C의 배포 Program ID와 초기화된 계정이 오면
위 순서로 실제 테스트를 진행한다.
