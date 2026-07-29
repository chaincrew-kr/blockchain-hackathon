# blockchain

블록체인 담당자의 작업 공간입니다.

예정 범위:

- 판매자/구매자 Devnet 지갑 및 키 보관 정책
- x402 결제 요구사항, 정산 영수증, Explorer 링크 표준화
- Devnet USDC 잔액과 정산 검증
- 반복 결제가 필요해질 경우 `@solana/subscriptions` 도입 검토

현재 x402 서버 어댑터는 `apps/api`, 지불 클라이언트는 `packages/agent`에 있습니다.
공용 온체인 코드가 두 곳 이상에서 필요해지는 시점에 이 패키지로 추출합니다.
