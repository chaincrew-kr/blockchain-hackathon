# Solana Devnet 준비

> **⚠️ 레거시 x402 PoC 지갑 안내:** 아래 `merchant-devnet`·`buyer-devnet` 구성과
> `npm run dev`·`npm run client` 명령은 `legacy/x402-*` 실험 기준입니다. 현재
> 영화 정산 제품은 극장·배급·제작·투자·에이전트 지갑과 영화별 에스크로 PDA를
> 사용합니다. 현재 지갑 도구는 [`tools/wallet/README.md`](../../tools/wallet/README.md),
> 전체 구조는 [Product Brief](../PRODUCT_BRIEF.md)를 참고하세요.

Devnet은 별도 체인을 “발급”받는 방식이 아니라 Solana가 운영하는 공용 테스트
클러스터입니다. 다만 팀은 미리 지갑, 테스트 토큰, 안정적인 RPC를 준비해야 합니다.

## 필요한 두 지갑

1. `merchant-devnet`: API 대금을 받는 공개 주소 (`SVM_ADDRESS`)
2. `buyer-devnet`: 에이전트가 결제에 사용하는 키
   (`.secrets/buyer-devnet.json`)

개인 메인넷 지갑을 재사용하지 말고 해커톤 전용 키페어를 만듭니다. 키 파일과 시드
구문은 Git, Slack, Notion에 올리지 않습니다.

## 준비 순서

1. Solana CLI를 설치하고 아래 고정 경로에 두 키를 만듭니다. `.secrets/` 전체는
   Git에서 제외됩니다.

   ```bash
   solana-keygen new --outfile .secrets/buyer-devnet.json
   solana-keygen new --outfile .secrets/merchant-devnet.json
   ```

   `buyer-devnet.json`에는 숫자 배열 형태의 개인키가 들어가며 절대 공유하거나
   커밋하지 않습니다. 공개 주소만 확인하려면 다음을 사용합니다.

   ```bash
   solana-keygen pubkey .secrets/buyer-devnet.json
   solana-keygen pubkey .secrets/merchant-devnet.json
   ```

   Solana CLI가 없는 환경에서는 프로젝트 명령으로 buyer 지갑을 생성하고 공개
   주소를 확인할 수 있습니다.

   ```bash
   npm run wallet:create
   npm run wallet:address
   ```

2. `solana config set --url devnet`으로 네트워크를 고정합니다.
3. [Solana Faucet](https://faucet.solana.com/) 또는 `solana airdrop 2 <주소> --url devnet`으로
   거래 수수료용 Devnet SOL을 받습니다.
4. CDP Portal 계정을 미리 만들고 Solana Devnet USDC를 buyer 지갑에 받습니다.
5. `.env.example`을 `.env`로 복사하고 판매자 공개 주소와
   `SVM_KEYPAIR_PATH=.secrets/buyer-devnet.json`을 확인합니다.
6. `npm run dev`와 `npm run client`로 결제 후 정산 트랜잭션을 확인합니다.

공식 Solana Faucet은 현재 일반 요청에 제한이 있으며 GitHub 로그인으로 한도를 높일
수 있습니다. CDP Faucet은 Solana Devnet SOL과 USDC를 제공하지만 CDP 계정/API 키가
필요하므로 행사 직전에 만들지 말고 미리 준비하는 편이 안전합니다.

## 신청해야 할 것과 아닌 것

- Solana Devnet 접속: 신청 불필요
- x402.org 테스트 퍼실리테이터: 신청/API 키 불필요
- Devnet SOL 웹 faucet: 주소만 필요하며 rate limit 존재
- Devnet USDC CDP faucet: CDP 계정 필요
- 전용 RPC(Helius/QuickNode 등): 팀이 안정성을 원하면 프로젝트/API 키를 미리 발급

Docker에는 키를 이미지로 복사하지 않고 `compose.yaml`의 `env_file`로 런타임에만
주입합니다. 클라우드 배포에서는 플랫폼의 Secret Manager를 사용합니다.
