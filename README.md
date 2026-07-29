# blockchain-hackathon — AI 영화 정산 에이전트

> **해커톤 주제 — AI 에이전트가 매 단계 사람 승인 없이, 정해진 한도 안에서 스스로
> 결제를 처리하는 프로덕트.** (Google Cloud × Solana, 단일 트랙: Solana 기반
> Agentic Commerce · [대회 개요·제출 요건](docs/team/HACKATHON.md))

독립영화 상영 수익이 **결제 순간부터 온체인 에스크로에 격리**되고, AI 에이전트가
계약 규칙·발권 로그를 검증해 **정산 실행을 스스로 판단·집행**하는 시스템입니다.
전체 흐름·역할·일정은 **[실행계획서 (PLAN-INDIE-003)](<docs/최종 실행계획서.html>)**
가 단일 기준 문서입니다.

```text
관객 결제(S1) → 에스크로 PDA(Pending) → 위험조정검증(S3) → 정산 판단(S4)
             → 배치 귀속(S2) → 분배 실행(S5) → 투명 대시보드(S6)
```

## 팀 역할

| 역할                   | 담당자 | 책임 영역                                                  |
| ---------------------- | ------ | ---------------------------------------------------------- |
| A — 프론트·AI 데이터   | 진규빈 | 계약 온보딩, 구매 웹, 대시보드, Gemini 프롬프트            |
| B — 체인·자금 흐름     | 정서윤 | `init_escrow`, `deposit`, `refund_pending`, `settle_batch` |
| C — 체인·판정 집행     | 최상아 | `claim`, `mark_disputed`, `resolve_dispute`                |
| D — 에이전트·판단 로직 | 박세령 | 위험조정검증, 정산 판단, 판단 로그 API                     |

## 저장소 구조

```text
apps/
├── web/            # [A] React — S1 구매 웹 · S0 백오피스 · S6 대시보드
└── agent/          # [D] Node+Express — S3 위험조정검증 · S4 판정 · 로그 API
packages/
└── schema/         # ★ 팀 공용 인터페이스 (정산 규칙 JSON 타입 · IDL) — 변경은 전원 리뷰
programs/
└── movie_escrow/   # [B·C] Anchor 프로그램 — deposit/settle_batch(B), claim/dispute(C)
tools/
└── wallet/         # Devnet 지갑 생성 도구 (극장/배급/제작/투자/에이전트 ×5)
legacy/             # x402 결제 PoC — Phase 2 재료로 보존 (워크스페이스 제외)
config/             # ESLint · TypeScript 공통 설정
docs/               # 실행계획서 · 온보딩 · 팀 규칙
```

`Anchor.toml`·`Cargo.toml`(루트)은 Anchor 워크스페이스 설정입니다 — B·C 관리.

## 빠른 시작

Node.js 22.10 이상. Windows PowerShell 실행 정책 오류 시 `npm` 대신 `npm.cmd`.

```bash
npm install
cp .env.example .env          # GEMINI_API_KEY, KOBIS_API_KEY 채우기
npm run dev:web               # 웹 (UI 목업 3화면) → http://localhost:4020
npm run dev:agent             # 정산 에이전트 → http://localhost:4030/health
npm run wallet:create theater # Devnet 지갑 생성 (.secrets/theater-devnet.json)
```

체인(B·C)은 `programs/movie_escrow/README.md`, 프론트(A)는 `apps/web/README.md`,
에이전트(D)는 `apps/agent/README.md`에서 시작하세요.

| 명령                    | 용도                                  |
| ----------------------- | ------------------------------------- |
| `npm run dev:web`       | 웹 개발 서버 (UI 목업 3화면 포함)     |
| `npm run dev:agent`     | 정산 에이전트 개발 서버               |
| `npm run wallet:create` | Devnet 지갑 생성 (`-- <이름>`)        |
| `npm run check`         | lint · 타입 · 테스트 · 포맷 전체 검사 |

## 팀 규칙

- 브랜치: `feature/* → dev → main`만 허용 — [Git 운영](docs/team/GIT_WORKFLOW.md)
- `packages/schema` 변경은 **전원 리뷰** (전역 결정 G6)
- 개발은 localnet, Devnet은 8/1 이후 및 제출·시연 때만
- x402·블록체인 개념이 처음이면 [개념 온보딩](docs/onboarding/CONCEPTS.md) 참고
  (단, 온보딩 문서의 코드 경로는 `legacy/` 이전 기준)

## 참고 자료

- [실행계획서 PLAN-INDIE-003](<docs/최종 실행계획서.html>) — 흐름·역할·일정·결정사항
- [디자인 시스템](docs/DESIGN.md) — void black + Dusk Violet
- [Anchor](https://www.anchor-lang.com/) · [Solana Pay](https://docs.solanapay.com/) · [pay.sh](https://pay.sh/docs) (Phase 2)
- [KOBIS 오픈API](https://www.kobis.or.kr/kobisopenapi/homepg/main/main.do) · [Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output)
