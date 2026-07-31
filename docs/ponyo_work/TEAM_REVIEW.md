# 팀에 요청 중인 것 — 리뷰·결정 대기

> 기준일: 2026-07-30 · 작성: D 박세령
> 작업 백로그는 [TASKS.md](TASKS.md), 범위 정의는 [README.md](README.md).

D 혼자 정할 수 없어서 팀을 기다리는 항목만 모았다. **"코드를 봐달라"와 "결정을
내려달라"는 다른 요청이라 나눠 적는다.**

---

## 1. 전원 리뷰 필수 — `packages/schema` 변경 (전역 결정 G6)

바꾼 파일은 `packages/schema/src/index.ts` 하나다. 이 파일 첫 줄에 "이 파일이
4인 병렬 개발의 계약서다"라고 적혀 있어 변경은 전원 리뷰 대상이다.

### 1-1. `SettlementRule.disputeThresholds` 필드 추가

SPEC-INDIE-002 §5의 규칙 JSON에는 있는데 스키마에 대응 필드가 없었다.

```ts
disputeThresholds: {
  refundRate: number; // 0.10
  freeTicketRate: number; // 0.15
}
```

**영향:** A가 STAGE 0 승인 UI에서 이 값을 그려야 한다. 계약 조항 값과 나란히
보여주면 "계약 상한 5% / 보류 임계 15%"의 두 층위가 화면에 드러난다.

### 1-2. `freeTicketCapRate` 주석 정정

기존 주석이 SPEC과 반대되는 단언을 하고 있었다.

```ts
// 이전
/** 무료 발권 상한 비율 (예: 0.05) — STAGE 3 P3 검증과 숫자 일치 필수 */
```

SPEC은 `compTicketCap`(0.05)과 `disputeThresholds.freeTicketRate`(0.15)를 같은
규칙 JSON 안에 **의도적으로 분리**해 뒀다. 계약 위반 기준과 자금 격리 기준은
다른 층위이고, 계약 위반이라고 곧바로 돈을 묶지 않으려는 완충이다.

D가 이 주석을 근거로 두 값을 같게 맞추려다 판정 문구가 어긋났다(아래 3번 참고).
같은 오해를 A·B·C가 반복하지 않도록 두 층위를 설명하는 주석으로 바꿨다.

**깨지는 코드 없음** — 현재 `SettlementRule`을 생성하는 코드가 저장소에 없다
(grep 확인). 필드 추가지만 기존 사용처에 영향이 없다.

---

## 2. 답이 필요한 결정 — 코드 리뷰가 아니라 판단 요청

| 대상    | 항목                               | 이슈                                                                      | 왜 급한가                               |
| ------- | ---------------------------------- | ------------------------------------------------------------------------- | --------------------------------------- |
| **B**   | 발권 이벤트 해시 산식              | [#8](https://github.com/chaincrew-kr/blockchain-hackathon/issues/8)       | 안 맞으면 **정상 회차도 전부 보류**된다 |
| **B**   | `MovieEscrow`에 상영관 식별 필드   | [#5](https://github.com/chaincrew-kr/blockchain-hackathon/issues/5)       | 온체인 이력 조회 구현 불가              |
| **B·C** | 회차 단위·`settle_batch` 시그니처  | [#6](https://github.com/chaincrew-kr/blockchain-hackathon/issues/6)       | 실제 체인 호출 연결 불가                |
| **B·C** | `EscrowStatus` 확정                | [#7](https://github.com/chaincrew-kr/blockchain-hackathon/issues/7)       | 지금은 D가 금액에서 자체 추론 중        |
| **A**   | 계약 조항 번호                     | [#15](https://github.com/chaincrew-kr/blockchain-hackathon/issues/15) B-6 | 제5조 외에는 D가 임의로 붙였다          |
| **팀**  | 환불률을 **건수** vs **금액** 기준 | [#15](https://github.com/chaincrew-kr/blockchain-hackathon/issues/15) B-1 | **판정 결과 자체가 바뀐다**             |
| **팀**  | 신규 상영관 강화 −30% 확정         | [#15](https://github.com/chaincrew-kr/blockchain-hackathon/issues/15) C-3 | 문서에 "합의 필요"인데 D가 확정해서 씀  |
| **팀**  | D5 규모 950/50 vs 픽스처 180/90    | [#15](https://github.com/chaincrew-kr/blockchain-hackathon/issues/15) C-2 | 보류 비중이 5% vs 33%로 다르다          |
| **팀**  | GCP 결제 계정 신청자               | [#13](https://github.com/chaincrew-kr/blockchain-hackathon/issues/13)     | Cloud Run 배포가 전면 차단됨            |

가장 무거운 건 **환불률 기준(B-1)** 이다. 문서에 "환불률 > 10%"라고만 있고
분모·분자가 없어서 D가 건수 기준으로 구현했는데, 금액 기준이면 같은 데이터로도
판정이 달라진다.

---

## 3. 참고 — 스키마 오해가 만든 실제 버그

1-2의 주석을 근거로 임계값과 계약 상한을 같은 것으로 다루다가, 판정 근거 문구가
계약서와 어긋났다.

```
이전: 제5조(무료 발권 상한) — 상한 10.5% 대비 18.2% 발권
          ↑ 제5조의 상한은 5%인데 10.5%라고 말함
이후: 제5조(무료 발권 상한) — 계약 상한 5% 대비 18.2% 발권 (보류 임계 10.5% 초과)
```

심사위원이 계약서와 판정 화면을 나란히 보면 드러나는 종류의 불일치였다.
수정은 완료했고, 같은 함수에서 좌석 초과 판정이 `좌석수 5000%석 대비 5500%건`
으로 깨지던 버그도 함께 잡았다(검사마다 단위가 다른데 포맷터 하나로 처리했다).

---

## 4. 제안 — A가 쓸 API 계약이 스키마 밖에 있다

> **2026-07-31 D 반영:** `BatchRunResponse`, `ApiErrorResponse`,
> `ApiErrorCode`를 `packages/schema`에 추가한 PR 초안을 작성했다.
> 공통 스키마 변경이므로 A·B·C 리뷰 후 확정한다.

`DashboardSnapshot`은 `packages/schema`에 있는데, D가 추가한 아래 두 형식은
스키마에 없다. **A가 추측해서 프론트를 짜야 하는 상태다.**

```ts
/** POST /api/batch/trigger 응답 */
interface BatchRunResponse {
  theater: string;
  /** true면 새로 실행한 게 아니라 기존 결과를 다시 준 것 (멱등성) */
  replayed: boolean;
  decisions: JudgeDecision[];
  timeline: TimelineEntry[];
}

/** 모든 오류 응답 (4xx·5xx 공통) */
interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    /** X-Request-Id 헤더와 같은 값 — Cloud Logging 검색용 */
    requestId: string;
  };
}

type ApiErrorCode =
  "batch_in_progress" | "not_found" | "chain_call_failed" | "internal_error";
```

스캐폴드를 잡는 단계라면 이 둘도 스키마에 올려서 A가 타입으로 받아쓰게 하는 게
좋다. 오류 `code`는 A가 화면 분기에 쓰므로 유니온 타입으로 고정하면 A가 분기를
빠뜨렸을 때 컴파일 단계에서 잡힌다.

**결정 요청:** 스키마에 올릴지, D가 별도 문서로만 공유할지.

---

## 5. 7/31 추가 결정 요청 — 이상 회차의 온체인 부분 보류 순서

B의 `settle_batch`와 IDL이 `dev`에 합쳐졌지만, 현재 D 파이프라인과 C의
`mark_disputed`가 요구하는 사전 상태가 다르다.

```text
현재 D: 이상 판정 → mark_disputed(회차 순매출 전액)
현재 C: settle_batch로 Allocation 생성 후
          → mark_disputed(특정 권리자 Allocation의 보류액)
```

`heldAmount`는 현재 회차 순매출 전액인데, `mark_disputed`는 특정
Allocation 하나만 받는다. 부가세·부과금을 제외한 권리자별 귀속액과
회차 총액은 같지 않으므로, D가 임의로 한 권리자 계정에 전액을 묶을 수
없다.

**팀 결정 필요:**

1. 이상 회차를 `pending`에 두고 온체인 `mark_disputed`를 호출하지 않는다.
2. `settle_batch` 후 권리자별 귀속액 전체를 각각 `mark_disputed`한다.
3. C가 회차 단위 총액을 한 번에 격리하는 instruction을 추가한다.

D 제안은 **2번**이다. 계약 규칙에 따른 귀속 결과를 먼저 계산하고,
인출만 막으면 정상 회차와 이상 회차의 권리자별 금액을 같은 방식으로
설명할 수 있다. 다만 여러 트랜잭션 중 일부만 실패하는 경우의 복구 정책도
같이 정해야 한다.

추가로 실제 `settle_batch` 호출에 필요한 `movieId`, 권리자 지갑 3개,
부율 BPS, 배급수수료 BPS를 어떤 API·저장소에서 D에게 전달할지도
A·B·D 계약으로 확정해야 한다.

---

## 5. 브랜치 상태 메모

현재 D의 커밋 2건이 `dev`에 직접 올라가 있고 원격에 푸시되지 않았다.

```
## dev...origin/dev [ahead 2]
9342524 fix(agent): 판정 근거 문구에서 계약 상한과 보류 임계를 구분
510a4d9 docs: 임의 결정 검토 이슈(#15)를 TASKS.md에 연결
```

[GIT_WORKFLOW.md](../GIT_WORKFLOW.md)는 `feature/* → PR → dev`이고 `dev`에
PR 필수·승인 1명 룰셋이 걸려 있어 그대로 푸시하면 거부된다. 특히 이번 변경은
`packages/schema`를 포함하므로 PR로 올려 리뷰를 받아야 한다.

**할 일:** feature 브랜치로 옮겨 PR 생성.
