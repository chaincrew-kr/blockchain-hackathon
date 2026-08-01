# agent — 정산 에이전트 서버 [담당: D]

STAGE 3(위험조정검증) · STAGE 4(정산 실행 판단)를 수행하는 Node + Express
서버입니다. 실행계획서(PLAN-INDIE-003) §3의 S5에 해당합니다.

```text
src/
├── risk-check/   # STAGE 3: 이력 조회 → 임계값 조정 → 데모 정합성 검증 3종(P3~P4)
│                 #   + Phase 2 훅 2개 (checkTrustFreshness / checkRefundEvidence)
├── judge/        # STAGE 4: 진행/부분 보류 판정 + Gemini 자연어 근거 (A와 공동)
└── routes/       # STAGE 6 대시보드용 로그 API (DashboardSnapshot 반환)
```

```bash
npm run dev:agent   # 루트에서 실행 → http://localhost:4030/health
```

실제 거래 전에 Devnet 프로그램·Escrow·authority·잔액과 데모 배치 필요 금액을
읽기 전용으로 점검합니다.

```bash
npm run chain:inspect --workspace @chaincrew/agent
```

## 규칙

- 입출력 타입은 전부 [`@chaincrew/schema`](../../packages/schema/src/index.ts)에서
  가져온다 — 임의로 로컬 타입을 만들지 말 것.
- Gemini 프롬프트·계약 조항·KOBIS 클라이언트는 A 소유
  [`@chaincrew/ai-data`](../../packages/ai-data/README.md)에서 가져온다. D 폴더에
  AI·데이터 구현을 추가하지 않는다.
- Phase 2(x402) 코드는 `risk-check`의 두 훅 **안에만** 들어간다. Phase 1에서는
  둘 다 `{ needed: false }` no-op을 유지한다 (협업 규칙 5).
- 판정이 "진행"이면 B의 `settle_batch`, "보류"면 C의 `mark_disputed`를 호출하는
  순서다 — 7/31 싱크 체크포인트에서 B·C와 호출 순서를 맞출 것.
