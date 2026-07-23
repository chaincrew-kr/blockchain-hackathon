# blockchain-hackathon

Solana Devnet과 x402 v2를 사용한 AI 에이전트 결제 해커톤 프로젝트입니다. 결제
증명이 없는 요청에는 `402 Payment Required`를 반환하고, 에이전트는 USDC 결제를
서명한 뒤 요청을 자동 재시도합니다.

## 저장소 구조

```text
apps/
├── api/          # Express + x402 유료 API (Backend/Cloud)
└── web/          # 데모 UI 작업 공간 (Frontend/Product)
packages/
├── agent/        # 402 처리, 지불 클라이언트, A2A (AI)
└── blockchain/   # 지갑, 정산, 공용 온체인 코드 (Blockchain)
docs/             # 팀 계획, Devnet, 아키텍처, Git 운영
config/           # ESLint, TypeScript 공통 설정
infra/            # Docker Compose
```

세부 역할과 일정은 [4인 팀 계획](docs/TEAM_PLAN.md), 시스템 경계는
[아키텍처](docs/ARCHITECTURE.md)를 참고하세요.

## 로컬 실행

Node.js 22.10 이상이 필요합니다. Windows PowerShell의 실행 정책 오류가 나면
`npm` 대신 `npm.cmd`를 사용하세요.

```bash
npm install
cp .env.example .env
```

`.env`의 `SVM_ADDRESS`를 결제를 받을 **Solana Devnet 공개 주소**로 바꿉니다.
개인 키나 시드 구문을 넣으면 안 됩니다.

```bash
npm run dev
```

다른 터미널에서 확인합니다.

```bash
curl http://localhost:4021/health
npm run inspect:402
```

`inspect:402`는 결제 전 HTTP 402와 `payment-required` 헤더를 출력합니다.

## Docker 실행

`.env` 설정 후 다음 한 명령으로 API를 빌드하고 실행합니다.

```bash
npm run docker:up
```

종료는 `npm run docker:down`입니다. 키는 이미지에 포함되지 않고 런타임에
`.env`로만 주입됩니다.

## 실제 Devnet 결제 테스트

구매자 지갑에 Devnet SOL과 USDC를 받은 뒤 키 파일을
`.secrets/buyer-devnet.json`에 둡니다. `.env`의 기본
`SVM_KEYPAIR_PATH`가 이 파일을 가리킵니다. 수신 지갑과 구매자 지갑은 분리하세요.

```bash
npm run client
```

Devnet 준비 방법과 무엇을 미리 신청해야 하는지는
[Devnet 가이드](docs/DEVNET.md)에 정리되어 있습니다.

`pay.sh`를 사용할 때는 다음처럼 기존 curl 호출을 감쌀 수 있습니다.

```bash
npm install -g @solana/pay
pay setup
pay curl http://localhost:4021/api/costly-data
```

## 주요 명령

| 명령                  | 용도                               |
| --------------------- | ---------------------------------- |
| `npm run dev`         | API 개발 서버                      |
| `npm run inspect:402` | 결제 전 402 챌린지 확인            |
| `npm run client`      | Devnet 결제 클라이언트 실행        |
| `npm run check`       | lint, 타입, 테스트, 포맷 전체 검사 |
| `npm run docker:up`   | Docker Compose 빌드/실행           |

## 팀 Git 규칙

`feature/* → dev → main`만 허용합니다. `main`과 `dev`에 직접 push하지 않습니다.
[Git 브랜치 운영](docs/GIT_WORKFLOW.md)을 따릅니다.

## 참고 자료

- [x402](https://x402.org/)
- [x402 판매자 빠른 시작](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers)
- [x402 구매자 빠른 시작](https://docs.cdp.coinbase.com/x402/quickstart-for-buyers)
- [Solana Subscriptions](https://github.com/solana-foundation/subscriptions)
- [pay.sh 문서](https://pay.sh/docs)
