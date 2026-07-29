# web — 프론트엔드 [담당: A]

STAGE 0(백오피스) · STAGE 1(모의 구매 웹) · STAGE 6(투명 대시보드)을 담는
**Vite + React** 앱입니다. 실행계획서(PLAN-INDIE-003) §3의 S1·S3·S4 화면에
해당하며, **3개 화면의 UI 목업이 실행 가능한 코드로 구현되어 있습니다** —
이 목업이 A의 개발 시작점입니다.

```bash
npm run dev:web   # 루트에서 실행 → http://localhost:4020
```

```text
src/
├── App.tsx           # 화면 셸 — 탭 전환 (라우터 도입 시 pages/를 라우트로 승격)
├── styles.css        # 디자인 토큰 + 전체 스타일 (docs/DESIGN (1).md 기준)
├── pages/
│   ├── purchase/     # STAGE 1: 티켓 구매 — Phantom 연결→Solana Pay 시뮬레이션
│   ├── backoffice/   # STAGE 0: 계약 온보딩 — Gemini 추출 테이블·충돌·양측 승인
│   └── dashboard/    # STAGE 6: 상태머신·불변식 스탯·판정 근거·타임라인·KOBIS 패널
├── components/       # BarChart (호버 툴팁 + 표로 보기)
└── mocks/demo.ts     # 목업 데이터 — 전부 @chaincrew/schema 타입으로 작성
```

## 실제 연동 시 교체 지점

각 파일 상단 주석에 명시되어 있습니다. 요약:

| 목업                         | 교체 대상                                                   |
| ---------------------------- | ----------------------------------------------------------- |
| Phantom 연결·결제 시뮬레이션 | `@solana/wallet-adapter` + Solana Pay (수취 = 에스크로 PDA) |
| `mocks/demo.ts` 추출 결과    | Gemini Structured Output 호출 (+ 실패 시 캐시)              |
| `mocks/demo.ts` snapshot     | `apps/agent` `GET /api/snapshot` 폴링 (vite proxy 설정됨)   |
| KOBIS 차트 고정 데이터       | KOBIS 오픈API 일별 박스오피스                               |

## 디자인

[docs/DESIGN (1).md](<../../docs/DESIGN (1).md>) — void black 캔버스, 고스트
카드(헤어라인 보더), 단일 액센트 Dusk Violet `#343755`, 필 버튼. 토큰은
`src/styles.css`의 `:root`에 정의. 차트 마크 색 `#6B74C0`은 Dusk Violet 계열
밝은 스텝으로 접근성(대비·CVD) 검증을 통과한 값이니 유지할 것.

## 데이터 계약

- 타입은 전부 [`@chaincrew/schema`](../../packages/schema/src/index.ts)에서
  가져온다 — `mocks/demo.ts`가 그 예시. 임의 로컬 타입 금지.
- 프로그램 호출은 `packages/schema/idl/`의 IDL 사용 (B·C가 빌드 후 복사).
