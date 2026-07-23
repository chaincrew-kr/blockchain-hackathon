# api

x402 유료 API 서버(**판매자 쪽**)입니다. 결제 증명이 없는 요청에는
`402 Payment Required`를 반환하고, 퍼실리테이터 검증을 거친 요청에만 데이터를
돌려줍니다.

## 엔드포인트

- `GET /health` — 공개 상태 확인 (`{"status":"ok"}`)
- `GET /api/costly-data` — `$0.001` USDC 결제가 필요한 샘플 API

## 실행

저장소 루트에서 실행합니다(`.env` 필요, `SVM_ADDRESS`에 판매자 공개 주소).

```bash
npm run dev        # 개발 서버 (기본 http://localhost:4021)
```

## 주요 파일

- `src/app.ts` — 라우트와 x402 결제 미들웨어
- `src/config.ts` — 환경변수 로드/검증 (네트워크, 가격, payTo 등)
- `src/server.ts` — 서버 부트스트랩

결제 흐름 전체 그림은 [아키텍처](../../docs/ARCHITECTURE.md), 구매자 쪽은
[`packages/agent`](../../packages/agent/README.md)를 참고하세요.
