# legacy — x402 결제 PoC (Phase 2 재료)

초기 탐색 단계에서 만든 **x402 v2 결제 왕복 PoC**입니다. 실행계획서
(PLAN-INDIE-003)에서 x402 연동이 **Phase 2(조건부)**로 확정되면서 현재 개발
대상에서 빠졌지만, Phase 2 착수 시 그대로 재료가 되므로 삭제하지 않고 여기에
보존합니다.

| 폴더           | 원래 위치            | 내용                                                        |
| -------------- | -------------------- | ----------------------------------------------------------- |
| `x402-api/`    | `apps/api`           | Express + x402 판매자 서버 (402 챌린지 → facilitator 검증)  |
| `x402-client/` | `packages/agent`     | 402 감지 → 서명 → 재시도하는 구매자 클라이언트              |
| `blockchain/`  | `packages/blockchain`| 온체인 작업 공간 계획 메모 — `programs/movie_escrow`로 대체 |

## 주의

- **워크스페이스에서 제외**되어 있습니다. 루트 `npm install`/`check`가 이 폴더를
  건드리지 않으며, `@x402/*` 의존성도 루트 lockfile에서 정리됩니다.
- `Dockerfile`·`compose.yaml`은 코드가 `apps/api`에 있던 시절의 경로를
  참조하므로 그대로는 동작하지 않습니다. 동작하던 시점은 git 이력
  (`ad06aac` 이전) 참고.
- Devnet 지갑 생성 도구(`wallet-create`, `wallet-address`)는 레거시가 아니라
  계속 필요하므로 [`tools/wallet`](../tools/wallet)로 이동했습니다.

## Phase 2 착수 시

`checkTrustFreshness()` / `checkRefundEvidence()` 훅([apps/agent](../apps/agent))
내부에 x402 조회를 채울 때, `x402-client/src/client.ts`의
`fetchWithPayment` 사용 패턴과 `x402-api`의 챌린지 구성을 참고하세요.
결제 스택은 pay.sh 채택 권장(실행계획서 STAGE 3 결정사항).
