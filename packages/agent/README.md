# agent

x402 결제를 자동 처리하는 **구매자 클라이언트**입니다. 402 응답을 감지하면 buyer
키로 결제를 서명하고, 결제 증명을 붙여 같은 요청을 자동 재시도합니다.

## 명령

저장소 루트에서 실행합니다.

```bash
npm run inspect:402   # 결제 전 402 챌린지와 payment-required 헤더 확인
npm run client        # 실제 결제 실행 후 정산 결과 출력
```

`npm run client`에는 자금이 있는 **구매자** 키가 필요합니다. `.env`의
`SVM_KEYPAIR_PATH`(Solana CLI JSON 키파일, 기본값) 또는 `SVM_PRIVATE_KEY`(base58)로
설정합니다. 준비 방법은 [팀 Devnet 셋업](../../docs/onboarding/TEAM_DEVNET_SETUP.md)을
참고하세요.

## 주요 파일

- `src/client.ts` — 402 감지 → 서명 → 재시도 → 정산 결과 출력
- `src/inspect-payment.ts` — 결제 없이 402 챌린지만 확인하는 도구

판매자 쪽 서버는 [`apps/api`](../../apps/api/README.md)에 있습니다.
