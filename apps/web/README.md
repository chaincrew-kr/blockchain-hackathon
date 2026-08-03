# web — 프론트엔드 [담당: A]

STAGE 0(백오피스) · STAGE 1(티켓 구매) · STAGE 6(투명 대시보드)을 담는
**Vite + React** 앱과, Gemini/KOBIS 호출·정산 에이전트 프록시를 맡는
**Express 서버**(`server/`)로 구성됩니다. 목업이 아니라 세 화면 모두
실제 온체인/Gemini/KOBIS 연동이 끝난 상태입니다.

```bash
npm run dev:web                       # 루트에서 실행 → http://localhost:4020
cd apps/web/server && npm run dev     # 별도 터미널 → http://localhost:8787
```

프론트가 백엔드 API(계약 추출·KOBIS·배치 트리거)를 쓰려면 `server/`도
같이 떠 있어야 합니다. 온체인 호출(deposit/refund/init_escrow)은 브라우저가
Phantom으로 직접 서명해서 보내므로 이 서버를 거치지 않습니다.

```text
apps/web/
├── src/
│   ├── App.tsx           # 화면 셸 — 탭 전환
│   ├── main.tsx          # 엔트리 — polyfills를 가장 먼저 import
│   ├── polyfills.ts      # Buffer/global 폴리필 (Anchor·web3.js가 Node 전역 기대)
│   ├── styles.css        # 디자인 토큰 + 전체 스타일 (docs/archive/DESIGN.md 기준)
│   ├── pages/
│   │   ├── purchase/     # STAGE 1: Phantom 연결 → deposit/refund_pending 직접 호출
│   │   ├── backoffice/   # STAGE 0: 업로드 → Gemini 추출 → 충돌·양측 승인 → init_escrow
│   │   └── dashboard/    # STAGE 6: 온체인 상태·판정 근거·타임라인·KOBIS 패널·배치 트리거
│   ├── lib/
│   │   ├── chain.ts      # Phantom 연결, deposit/refundPending/initEscrow, PDA 유틸
│   │   ├── api.ts        # server/ 호출 (extract, KOBIS, batch trigger/reset)
│   │   ├── adaptExtraction.ts  # Gemini 응답 → SettlementRule 변환, 충돌 근거 매핑
│   │   ├── hash.ts       # 계약 원문/규칙 해시 계산 (브라우저에서 직접, FR-06)
│   │   └── usdc.ts       # USDC 표시단위 ↔ 최소단위 변환
│   ├── components/       # BarChart · PhantomIcon · ClockIcon
│   └── mocks/demo.ts     # 대시보드 mock 모드 폴백 데이터 (전부 @chaincrew/schema 타입)
└── server/                # Express — 브라우저가 IAM/API 키를 직접 갖지 않도록 하는 프록시
    ├── index.js           # 라우트: /api/extract, /api/kobis/*, /api/batch/trigger|reset
    ├── extract-service.js # Gemini Structured Output 호출
    ├── kobis-service.js   # KOBIS 오픈API 호출
    └── agent-proxy.js     # 배포된 Agent(Cloud Run, IAM 인증) 호출 — ADC 사용
```

## 실연동 현황

| 화면          | 항목                     | 연동 방식                                                                  |
| ------------- | ------------------------ | --------------------------------------------------------------------------- |
| S1 구매       | 결제(deposit)/환불       | Phantom이 브라우저에서 직접 서명 → `movie_escrow` 온체인 호출 (서버 미경유) |
| S0 백오피스   | 계약서 추출              | `server/`가 Gemini Structured Output 호출 (`extract-service.js`)             |
| S0 백오피스   | 규칙 해시·온체인 등록    | 브라우저에서 해시 계산 후 Phantom 서명으로 `init_escrow` 직접 호출          |
| S6 대시보드   | "정산일 도래" 트리거·판정 근거·tx 타임라인 | `server/`가 IAM 인증 프록시로 배포된 Agent(Cloud Run) 호출 (`agent-proxy.js`) — 트리거 전엔 mock 미리보기, 트리거 후 실제 응답으로 교체 |
| S6 대시보드   | 잔액·상태머신(snapshot) | **아직 목업.** 배치 트리거 응답엔 판정 결과만 있고 온체인 잔액은 안 줌 — 별도 스냅샷 API 나오면 교체 |
| S6 대시보드   | KOBIS 박스오피스 패널    | `server/`가 KOBIS 오픈API 호출 (`kobis-service.js`)                          |

대시보드는 아직 온체인 계정을 직접 읽지 않습니다 — "판정 근거"는 배치
트리거 API 응답, "잔액·상태머신"은 `mocks/demo.ts` 그대로입니다. 자세한
교체 진행 상황은 `DashboardPage.tsx` 상단 주석 참고.

## 환경변수

**`apps/web/.env`** — Vite는 `VITE_` 접두사 변수를 **빌드 타임**에 번들에
박아 넣습니다. Cloud Run 배포는 런타임에 못 바꾸므로 `cloudbuild.web.yaml`의
`--build-arg`로 넘겨야 하고(§배포 참고), 로컬 개발은 `.env.example`을 복사해서
씁니다.

- `VITE_API_URL` — `server/`의 주소. Cloud Run 통합 빌드에선 비워두면 같은
  Origin의 `/api`를 씀.
- `VITE_SOLANA_RPC_URL` / `VITE_SOLANA_CLUSTER` — localnet/devnet 전환은
  이 두 값만 바꾸면 됨 (program id는 IDL에 이미 고정).
- `VITE_MOVIE_ID` — 구매 화면이 결제를 시도할 에스크로의 movieId. 실제
  온체인 에스크로 시드와 다르면 deposit이 "Account does not exist"로 실패.

**`apps/web/server/.env`** — Gemini/KOBIS API 키, 배포 시 Basic Auth
(`DEMO_AUTH_USER`/`DEMO_AUTH_PASSWORD`), Agent 프록시 설정
(`AGENT_BASE_URL`, `AGENT_USE_IAM_AUTH`). 자세한 설명은
`server/.env.example` 주석 참고.

## 배포

Cloud Run에 두 서비스가 따로 떠 있습니다:

- `chaincrew-web` — 이 앱 전체(정적 빌드 + `server/` API). 빌드는
  `gcloud builds submit --config=cloudbuild.web.yaml .`, 이미지 교체 배포는
  `gcloud run deploy chaincrew-web --image=... --region=asia-northeast3`.
- `chaincrew-agent` — 정산 에이전트(`apps/agent`), `agent-proxy.js`가
  IAM 인증으로 호출하는 대상.

빌드타임 Vite 변수(`VITE_SOLANA_RPC_URL` 등)를 안 넘기면 조용히
localnet/기본값으로 굳어버리니, 재배포 전엔 `cloudbuild.web.yaml`의
`--build-arg` 목록이 최신인지 꼭 확인할 것. 자세한 절차·시크릿 목록은
`docs/archive/ponyo_work/GCP_DEPLOYMENT_GUIDE.md` 참고.

## 디자인

[디자인 참고 문서](../../docs/archive/DESIGN.md) — void black 캔버스, 고스트
카드(헤어라인 보더), 단일 액센트 Dusk Violet `#343755`, 필 버튼. 토큰은
`src/styles.css`의 `:root`에 정의. 차트 마크 색 `#6B74C0`은 Dusk Violet 계열
밝은 스텝으로 접근성(대비·CVD) 검증을 통과한 값이니 유지할 것.

## 데이터 계약

- 타입은 전부 [`@chaincrew/schema`](../../packages/schema/src/index.ts)에서
  가져온다 — `mocks/demo.ts`가 그 예시. 임의 로컬 타입 금지.
- 프로그램 호출은 `packages/schema/idl/`의 IDL 사용 (B·C가 빌드 후 복사).
