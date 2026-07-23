# 팀 공용 Devnet 결제 셋업 가이드

> **📝 이 문서의 성격:** 개인이 온보딩 세션에서 작성한 **셋업 노트**입니다. 아직 팀이
> 공식 합의한 표준 절차가 아니며, 팀 리뷰(PR)를 거쳐 확정될 예정입니다. 지갑 주소 등
> 구체 값은 현재 개인 테스트 기준이라 팀 합의 후 바뀔 수 있습니다.

해커톤 팀이 **같은 devnet 지갑**으로 x402 결제를 테스트하기 위한 안내입니다. 이
문서에 적힌 값은 모두 **공개해도 안전한 주소**입니다. 실제 개인키는 문서에 넣지
않고 팀 채널(Slack DM / 1Password 등)로만 전달합니다.

> **왜 devnet 키는 공유해도 되나요?** devnet 토큰은 가치가 0인 테스트용이라, 이
> 개인키가 유출돼도 잃을 진짜 돈이 없습니다. 단 mainnet 키는 절대 공유·재사용
> 금지입니다. 자세한 배경은 [DEVNET.md](DEVNET.md)를 참고하세요.

## 공용 지갑 정보 (공개 가능)

| 항목 | 값 | 역할 |
| --- | --- | --- |
| merchant 주소 (`SVM_ADDRESS`) | `7CCkgtKXQThSYf4xLuDpM7NL6ybEf1pGwz8BwVKPwZRh` | 결제를 **받는** 판매자 지갑 (공개 주소만 필요) |
| buyer 주소 | `2vNC3EzRQuHqfwDuFbJvrH59gFerfu9E61nYTYbgHzDp` | 결제를 **내는** 구매자 지갑 |
| USDC 민트 (devnet) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | 서버가 요구하는 결제 토큰 |
| merchant USDC 토큰계정(ATA) | `64wTiyJHoj3y2cTwvApsuzChtkk8iJNv1rovsHXoHV65` | 이미 생성 완료 (아래 참고) |

buyer **키페어 파일**(`buyer-devnet.json`, 64바이트 숫자 배열)은 **문서에 없습니다.**
팀 채널(Slack DM 등)에서 별도로 전달받으세요.

## 사전 준비

- Node.js 22.10 이상
- (선택) Solana CLI — 잔액 확인/디버깅용. 없어도 결제 테스트 자체는 됩니다.
- Windows PowerShell에서 실행 정책 오류가 나면 `npm` 대신 `npm.cmd` 사용

## 셋업 순서

### 1) 저장소 클론 후 의존성 설치

```bash
npm install
```

### 2) 구매자 키페어 파일 배치

팀 채널에서 받은 `buyer-devnet.json`을 저장소의 `.secrets/` 폴더에 둡니다.

```bash
mkdir -p .secrets
# 받은 buyer-devnet.json을 .secrets/buyer-devnet.json 으로 저장
```

`.secrets/`와 `buyer-devnet.json`은 `.gitignore`에 등록돼 있어 Git에 올라가지
않습니다. (안심하고 그대로 두세요.)

### 3) `.env` 생성

```bash
cp .env.example .env
```

`.env`를 열어 **판매자 주소만** 아래 값으로 채웁니다. 구매자 키는 기본값
`SVM_KEYPAIR_PATH`가 위 파일을 가리키므로 따로 안 넣어도 됩니다.

```dotenv
PORT=4021
FACILITATOR_URL=https://x402.org/facilitator
X402_NETWORK=solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1
PAYMENT_PRICE=$0.001

# 판매자(수령) 공개 주소 — 아래 값 그대로 사용
SVM_ADDRESS=7CCkgtKXQThSYf4xLuDpM7NL6ybEf1pGwz8BwVKPwZRh

RESOURCE_SERVER_URL=http://localhost:4021
# 구매자 키페어 파일 경로 (기본값 그대로 두면 됨)
SVM_KEYPAIR_PATH=.secrets/buyer-devnet.json
```

> **대안:** 키페어 파일 대신 base58 문자열을 쓰려면, 위 줄 대신
> `SVM_PRIVATE_KEY=<base58 값>`을 넣어도 됩니다(둘 중 하나만).

> `.env`도 `.gitignore`에 등록돼 있어 Git에 올라가지 않습니다.

### 4) 서버 실행

```bash
npm run dev
```

`http://localhost:4021`에서 API 서버가 뜹니다. (서버는 각자 **본인 PC**에서
돌아갑니다. 공용 서버가 아닙니다.)

### 5) 결제 전 챌린지 확인 (선택)

다른 터미널에서:

```bash
curl http://localhost:4021/health      # {"status":"ok"}
npm run inspect:402                     # HTTP 402 + payment-required 헤더
```

### 6) 실제 결제 테스트

```bash
npm run client
```

성공하면 `200 OK`와 함께 `Settlement: { success: true, transaction: "...", ... }`가
출력됩니다. 그 `transaction` 서명을 아래 링크에 넣으면 온체인에서 확인 가능합니다.

```
https://explorer.solana.com/tx/<서명>?cluster=devnet
```

## 잔액이 부족할 때 (USDC 소진 시)

공용 buyer 지갑의 devnet USDC는 결제할 때마다 조금씩 줄어듭니다($0.001씩).
바닥나면 누구든 아래로 다시 충전할 수 있습니다.

1. https://faucet.circle.com/ 접속
2. **USDC** 선택, **Network를 반드시 `Solana Devnet`으로** 변경 (기본값이 다른
   네트워크일 수 있으니 주의)
3. Send to에 buyer 주소 `2vNC3EzRQuHqfwDuFbJvrH59gFerfu9E61nYTYbgHzDp` 입력 후 전송

수수료용 SOL이 필요하면 https://faucet.solana.com/ 에서 같은 buyer 주소로 받습니다
(GitHub 로그인 시 한도 상승).

## merchant 토큰계정(ATA)에 대한 메모

Solana에서는 토큰을 **받으려면** 받는 쪽에 그 토큰 전용 계정(ATA)이 있어야 합니다.
merchant 지갑의 USDC ATA는 **이미 생성해 두었으므로** 팀원이 따로 만들 필요는
없습니다. 만약 새 merchant 지갑을 쓰게 되면 최초 1회 아래처럼 생성해야 합니다.

```bash
spl-token transfer 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU 1 <merchant주소> \
  --owner <buyer키파일> --fee-payer <buyer키파일> \
  --fund-recipient --allow-unfunded-recipient --url devnet
```

## 보안 체크리스트

- [ ] `.env`와 `.secrets/`, `*-devnet.json` 키파일을 **Git에 커밋하지 않는다** (`.gitignore`로 이미 차단)
- [ ] 키페어 파일/개인키는 Slack DM / 1Password 등 안전한 경로로만 공유한다
- [ ] 이 devnet 키를 **mainnet에서 재사용하지 않는다**
- [ ] mainnet 전환 시에는 **새 지갑을 새로 생성**하고 키를 공유하지 않는다
