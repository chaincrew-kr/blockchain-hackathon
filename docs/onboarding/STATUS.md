# 현재 구현 현황

> 2026-07-30 기준. 제품 범위는 [Product Brief](../PRODUCT_BRIEF.md), 역할·일정은
> [PLAN-INDIE-003 v0.4](../최종%20실행계획서.html)를 기준으로 합니다.

## 제품 상태

제품 주제는 **독립영화 온체인 정산 에이전트**로 확정됐습니다. 영화 티켓 매출을
영화별 Solana 에스크로 PDA에 격리하고, AI 에이전트가 승인된 계약 규칙과
발권·환불 이력을 검증해 정상 금액은 정산하고 이상 금액만 보류합니다.

기존 x402 요청당 결제 코드는 현재 제품의 핵심 경로가 아니며 `legacy/x402-*`에
보존돼 있습니다. x402/pay.sh는 Phase 1 완주 후 조건부 신뢰도·증빙 조회에만
사용하는 Phase 2 범위입니다.

## 구현 완료

| 영역        | 현재 상태                                    | 확인 위치                   |
| ----------- | -------------------------------------------- | --------------------------- |
| Web UI 골격 | 구매·백오피스·대시보드 화면 목업             | `apps/web`                  |
| 공용 스키마 | 정산 규칙, 검증 결과, 판단, 대시보드 타입    | `packages/schema`           |
| Anchor 골격 | 영화 에스크로 상태와 instruction 구조        | `programs/movie_escrow`     |
| STAGE 3     | 임계값 조정, 환불률·무료 발권·좌석·해시 검증 | `apps/agent/src/risk-check` |
| STAGE 4     | 진행·부분 보류 판정, 보류액·근거 조항 계산   | `apps/agent/src/judge`      |
| Agent API   | health, 배치 트리거, 스냅샷, 발권 로그       | `apps/agent/src/routes`     |
| 테스트      | D 파트 타입 검사 및 테스트 13개 통과         | `apps/agent/test`           |
| 문서        | 요구사항 v0.2, 스펙 v0.5, 실행계획 v0.4      | `docs/`                     |

## 연결 대기

| 영역        | 남은 작업                                                 | 의존              |
| ----------- | --------------------------------------------------------- | ----------------- |
| Solana 이력 | fixture provider를 실제 RPC 조회로 교체                   | B·C IDL·계정 구조 |
| 체인 호출   | stub gateway를 실제 `settle_batch`·`mark_disputed`로 교체 | B·C 프로그램      |
| Gemini      | 템플릿 리포트를 실제 자연어 판단 리포트로 교체            | A 프롬프트·API 키 |
| Dashboard   | Agent 스냅샷 API를 실제 화면에 연결                       | A                 |
| 상태 저장   | 메모리 판단 로그를 Firestore로 영속화                     | A·D               |
| 배포        | Cloud Run·Scheduler·Secret Manager 구성                   | D                 |
| E2E         | 구매 → 검증 → 판단 → 분배를 Localnet·Devnet에서 검증      | 전원              |

## 현재 실행

```bash
npm install
cp .env.example .env
npm run dev:web
npm run dev:agent
```

에이전트 health 확인:

```bash
curl http://localhost:4030/health
```

전체 품질 검사:

```bash
npm run check
```

## 완료 판단

Phase 1 완료는 Requirements의 D1~D7이 실제 Localnet/Devnet 흐름에서 연속으로
통과했을 때입니다. fixture/stub 테스트 통과만으로 Phase 1 전체 완료로 보지
않습니다.

D 파트의 상세 체크 상태는 [ponyo_work](../ponyo_work/README.md)를 참고하세요.
