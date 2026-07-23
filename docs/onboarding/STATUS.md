# 현재 구현 현황

> 2026-07-23 기준. 새 기능이 붙거나 방향이 바뀌면 이 문서를 갱신하세요.

## ✅ 지금 되는 것

| 기능 | 확인 방법 | 비고 |
| --- | --- | --- |
| x402 유료 API 서버 (판매자) | `npm run dev` → `GET /api/costly-data`가 402 반환 | `$0.001` USDC, Express |
| 402 챌린지 확인 도구 | `npm run inspect:402` | 결제 전 요구사항 조회 |
| 자동 결제 클라이언트 (구매자) | `npm run client` | 402 감지 → 서명 → 재시도 → 정산 출력 |
| **실제 Devnet 결제 E2E** | 위 명령으로 검증 완료 (2026-07-23) | 정산 트랜잭션이 Solana Explorer에서 확인됨 |
| 팀 공용 devnet 지갑 | [TEAM_DEVNET_SETUP](TEAM_DEVNET_SETUP.md) | buyer에 SOL·USDC 충전됨 |
| Docker 실행 | `npm run docker:up` | 키는 런타임 주입 |
| 품질 검사 | `npm run check` | lint + 타입 + 테스트 + 포맷 |

## ❌ 아직 없는 것

| 항목 | 상태 | 관련 |
| --- | --- | --- |
| 프론트엔드(데모 UI) | `apps/web`은 README만 있는 빈 작업 공간 | 해커톤 제출엔 데모 화면 필요 |
| **AI 판단 로직** | 현재 클라이언트는 규칙 기반 자동 봇 — "언제 무엇을 살지" 판단하는 AI 없음 | [CONCEPTS 10번](CONCEPTS.md#10-그래서-뭐가-ai인가--ai-에이전트-빌드업) |
| 라이브 배포 엔드포인트 | 서버는 로컬(localhost)에서만 실행 | 해커톤 권장 제출물 |
| **제품 주제 확정** | 결제 레일 위에 얹을 제품이 미정 (OpenBench 후보 논의 중) | [notice 수상작 분석](../notice/solana_top25_winners_analysis_light.html) |
| 예산·한도 정책 | 에이전트 지출 한도, 승인 정책 없음 | 해커톤 주제가 "한도 안에서 스스로 결제" |
| A2A (에이전트 간 결제) | 미구현 | 트랙 C 확장 방향 |

## 위치 감각 — 우리가 어디까지 왔나

해커톤 수상작 분석([notice](../notice/solana_top25_winners_analysis_light.html))에 따르면
심사는 "결제가 된다"가 아니라 **"누가 돈을 내는 어떤 제품인가"**를 봅니다. 현재
완성된 x402 결제는 제품의 **Resource Execution(자원 실행) 레이어의 결제 레일**에
해당하며, 그 위에 얹을 제품(집계·인텔리전스·실행을 통합한 무언가)을 정하는 것이
다음 단계입니다.
