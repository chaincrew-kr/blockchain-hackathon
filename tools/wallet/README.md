# wallet — Devnet 지갑 도구 (팀 공용)

실행계획서 체크리스트의 **Devnet 지갑 ×5**(극장/배급/제작/투자/에이전트)를
만드는 도구입니다. `packages/agent`(현 `legacy/x402-client`)에서 분리했습니다.

```bash
# 루트에서 실행. 이름을 주면 .secrets/<이름>-devnet.json 생성 (기본: buyer)
npm run wallet:create -- theater
npm run wallet:create -- distributor
npm run wallet:create -- producer
npm run wallet:create -- investor
npm run wallet:create -- agent

# 주소 확인
npm run wallet:address -- .secrets/theater-devnet.json
```

키파일은 `.secrets/`에 저장되며 git에 올라가지 않습니다. faucet 충전 등은
[팀 Devnet 셋업](../../docs/archive/onboarding/TEAM_DEVNET_SETUP.md) 참고.
