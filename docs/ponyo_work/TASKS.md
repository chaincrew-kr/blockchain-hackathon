# D 작업 백로그 — 남에게 안 막히는 것부터

> 기준일: 2026-07-30
> 범위 정의는 [README.md](README.md), 막힌 항목은 GitHub 이슈 [#5](https://github.com/chaincrew-kr/blockchain-hackathon/issues/5)~[#9](https://github.com/chaincrew-kr/blockchain-hackathon/issues/9).
> 팀에 리뷰·결정을 요청 중인 항목은 [TEAM_REVIEW.md](TEAM_REVIEW.md),
> 제출 마감 역산은 [DEADLINE.md](DEADLINE.md) — **8/3(월) 마감, 남은 4일**.

`feature/agent-settlement-pipeline` 기준으로 STAGE 3·4 로직은 fixture/stub으로
완주한다(타입 검사 통과, 테스트 13개 통과). 이 문서는 **그 다음에 D가 무엇을
어떤 순서로 하는가**만 다룬다.

원칙: **B·C·A의 결정을 기다려야 하는 일과 아닌 일을 섞지 않는다.** 기다리는 동안
할 수 있는 일이 아직 많이 남아 있다.

## 범례

- ✅ 완료 · 🟡 진행 가능(의존성 없음) · ⛔ 이슈 대기 · 🔑 외부 계정 인증 필요

---

## A. 지금 혼자 가능 — 의존성 0

### T1 ✅ Docker 이미지 — 완료 (2026-07-30)

- [x] `apps/agent/Dockerfile` 작성 — 모노레포 workspace 빌드 고려
- [x] `.dockerignore` 보강 — `.env.*`, `.secrets`, 지갑 키파일 제외
- [x] 로컬 빌드 후 컨테이너 실행 (이미지 311MB)
- [x] 컨테이너에서 `/health` 200 확인
- [x] 컨테이너에서 `POST /api/batch/trigger` → 판정 2건 반환 확인
- [x] `PORT` 환경변수 수용 (Cloud Run 주입값 — `AGENT_PORT`는 로컬용으로 유지)

빌드·실행 방법 (컨텍스트는 **저장소 루트**여야 한다):

```bash
docker build -f apps/agent/Dockerfile -t chaincrew-agent:local .
docker run --rm -p 4031:4030 chaincrew-agent:local
curl http://localhost:4031/health
```

로컬 dev 서버가 4030을 쓰고 있으면 호스트 포트를 바꿔서 띄운다.

컨테이너 검증 결과 — 정상 회차는 `proceed`, 이상 회차는 `partial-hold`로
90 USDC 격리, 근거 조항까지 반환된다.

```
SCR-2026-0730-14  proceed       held 0
SCR-2026-0730-23  partial-hold  held 90000000
  제5조(무료 발권 상한) — 상한 10.5% 대비 18.2% 발권
```

임계값이 15%가 아니라 10.5%로 뜨는 건 신규 상영관 강화 배율(−30%)이 적용된
결과다. 이력이 쌓이면 15%로 돌아온다.

### T2 ✅ 배치 API 견고성 — 완료 (2026-07-30)

- [x] **멱등성** — 버튼 연타·Scheduler 중복 호출에도 이중 정산이 없다
- [x] **4xx / 5xx 구분** — 모든 예외를 500으로 뭉뚱그리던 것을 분류
- [x] **구조화 로그** — Cloud Logging JSON 한 줄 + requestId 상관관계
- [x] 리허설 반복용 `POST /api/batch/reset` (멱등성 잠금 해제 수단)

배치 트리거의 상태 전이:

| 상태    | 응답                                 |
| ------- | ------------------------------------ |
| 미실행  | 실행 후 `200 { replayed: false }`    |
| 실행 중 | `409 batch_in_progress`              |
| 완료됨  | 재실행 없이 `200 { replayed: true }` |

점유는 첫 `await` 이전에 동기적으로 끝난다. Node는 단일 스레드라 `await`
사이에만 다른 요청이 끼어들 수 있으므로, 검사와 점유가 같은 tick에 끝나야
동시 요청 두 개가 함께 통과하지 않는다.

오류 분류 — 호출자가 고칠 수 있으면 4xx, 우리·업스트림 문제면 5xx:

| 상황                      | 상태 | `code`              |
| ------------------------- | ---- | ------------------- |
| 배치 실행 중 중복 요청    | 409  | `batch_in_progress` |
| 없는 경로                 | 404  | `not_found`         |
| 체인 호출 실패 (RPC 장애) | 502  | `chain_call_failed` |
| 그 외                     | 500  | `internal_error`    |

502를 500과 나눈 이유는 A가 "재시도하면 될 수도 있는 상황"인지 판단해야 하기
때문이다. 응답 본문은 `{ error: { code, message, requestId } }`로 고정했고,
내부 예외 메시지·스택은 밖으로 내보내지 않는다.

체인 호출이 실패하면 실행 슬롯을 반드시 놓아준다 — 안 그러면 이후 요청이
영원히 409를 받는다 (테스트로 고정).

로그는 Cloud Logging이 파싱하는 JSON 한 줄이다. `requestId`로 요청 하나의
로그만 필터링할 수 있고, `X-Request-Id` 응답 헤더로 같은 값을 돌려주므로
대시보드 오류 화면의 ID를 그대로 로그 탐색기에 넣으면 된다.

```json
{
  "severity": "INFO",
  "message": "batch completed",
  "requestId": "db42d8d3-…",
  "theater": "THEATER-INDIE-001",
  "screenings": 2,
  "heldScreenings": 1,
  "heldAmount": 90000000
}
```

테스트 22개 통과 (T2로 9개 추가). 컨테이너에서도 연타 → `replayed: true`,
reset → 재실행 가능을 확인했다.

### T3 🟡 CORS

- [ ] `cors` 의존성 추가 (`apps/agent/package.json`에 아직 없음)
- [ ] 허용 출처를 환경변수로 분리 — A의 배포 URL이 정해지기 전에도 작업 가능
- [ ] `.env.example`에 변수 반영

### T4 🟡 이상 시나리오 픽스처 확대

현재 이상 회차가 **무료 발권 초과 1건뿐**이다. 검증은 4종인데 나머지 3종은 실제로
보류를 유발하는 픽스처가 없어서 회귀 테스트가 비어 있다.

- [ ] 환불률 상한 초과 회차 (P3)
- [ ] 좌석 수 초과 발권 회차 (P4)
- [ ] 해시 연속성 훼손 회차 (P5) — 사후 조작 시연용
- [ ] 각 회차의 판정·보류액·근거 조항 테스트 추가
- [ ] 데모용으로 어떤 회차를 쓸지 선택 (심사 시연 시나리오는 무료 발권 초과)

---

## B. 껍데기 먼저 — 남의 결정이 오면 안쪽만 채운다

### T5 🟡 GeminiNarrativeGenerator

[README.md](README.md) §4 기준으로 **Gemini 키 발급은 A, 서버 연동과 Secret 주입은
D**다. A의 프롬프트가 확정되기 전에도 D 몫은 전부 구현할 수 있다.
`NarrativeGenerator` 인터페이스로 이미 분리돼 있어 판정 로직은 건드리지 않는다.

- [ ] `@google/genai` 연동 구현체 추가
- [ ] 타임아웃·재시도 정책
- [ ] 실패 시 `templateNarrative` 폴백 (D5 완료 기준)
- [ ] `GEMINI_API_KEY` 미설정 시 자동으로 템플릿 사용 — 키 없이도 서버가 뜬다
- [ ] 프롬프트 문자열은 A 확정본으로 교체 (A 대기, 이 항목만)

데모에서 "보류됨"만 뜨고 이유가 룰베이스로 보이면 감점 항목이라, D5 완료 기준
3개 중 1개가 여기에 걸려 있다.

### T6 🟡 AnchorChainGateway 골격

IDL 없이도 연결 계층은 미리 짤 수 있다. instruction 호출부만 비워두면 IDL이
들어오는 날 붙이는 시간이 줄어든다.

- [ ] `@coral-xyz/anchor` 의존성 추가
- [ ] Connection · Provider · 서명 키페어 로딩
- [ ] Anchor 에러 → HTTP 응답 매핑
- [ ] instruction 호출부는 비워둠 ([#6](https://github.com/chaincrew-kr/blockchain-hackathon/issues/6) 시그니처 확정 대기)

---

## C. 배포 — D 주담당이나 GCP 계정 인증 필요

**⛔ 현재 최대 병목: GCP 결제 계정이 0개다** — 이슈
[#13](https://github.com/chaincrew-kr/blockchain-hackathon/issues/13)으로 팀에
올려둠. Cloud Run은 무료 한도 안에서 쓰더라도 프로젝트에 결제 계정이 연결돼
있어야 배포된다.

[HACKATHON.md](../team/HACKATHON.md) 기준으로 신규 계정 **$300 체험판**을 신청하면
되고 개인 Gmail 계정이 필수다. 크레딧은 **가입일로부터 90일 만료**라 신청 시점을
데모 일정과 맞춰야 한다. 카드 등록은 본인확인용이며 체험판 중에는 청구되지 않는다.

**신청자는 D가 아니어도 된다.** 결제 계정 소유자와 실제 배포 작업자가 달라도
되므로, 팀원 누구든 프로젝트·결제 계정을 만든 뒤 D 계정에 IAM 역할만 부여하면
그 다음부터는 D가 진행할 수 있다. 필요한 역할 목록은 이슈 #13에 정리돼 있다.

### T7 🔑 Cloud Run

- [x] `gcloud` CLI 설치 (578.0.0) 및 로그인 (`03.ryeong@gmail.com`)
- [ ] **결제 계정 확보 — 신청자 결정 (#13, 이후 작업 전부의 선행 조건)**
- [ ] 프로젝트 생성 후 D 계정에 IAM 역할 부여
- [ ] GCP 프로젝트·리전 결정 후 팀에 공유 (리전은 서울 `asia-northeast3` 권장)
- [ ] fixture/stub 버전 먼저 배포 → `/health` 확인
- [ ] 배포 스크립트 또는 명령을 문서화 (재현 가능하게)

### T8 🔑 Secret Manager

- [ ] `GEMINI_API_KEY` 등록
- [ ] Cloud Run 서비스에 주입
- [ ] 로그·API 응답에 비밀값이 노출되지 않는지 확인

### T9 🔑 Cloud Scheduler

- [ ] 인증된 배치 엔드포인트 설정
- [ ] 데모 "정산일 도래" 버튼도 같은 파이프라인을 호출하는지 확인
      (전역 결정 G2 — Scheduler는 코드 존재 증명, 실제 시연은 버튼)

### T10 🟡 장애 폴백 절차 문서화

- [ ] Devnet 장애 시 로컬 validator / fixture 폴백 절차
- [ ] 리허설에서 실제로 한 번 돌려보고 문서 검증

---

## D. 이슈 대기 — 지금은 못 함 ⛔

| 막힌 작업                       | 이슈                                                                | 대기 대상 |
| ------------------------------- | ------------------------------------------------------------------- | --------- |
| `RpcHistoryProvider` 실제 조회  | [#5](https://github.com/chaincrew-kr/blockchain-hackathon/issues/5) | B         |
| 실제 `settle_batch` 호출        | [#6](https://github.com/chaincrew-kr/blockchain-hackathon/issues/6) | B·C       |
| `DashboardSnapshot.status` 확정 | [#7](https://github.com/chaincrew-kr/blockchain-hackathon/issues/7) | B·C       |
| 해시체인 산식 일치              | [#8](https://github.com/chaincrew-kr/blockchain-hackathon/issues/8) | B         |
| 임계값·조항 번호 확정           | [#9](https://github.com/chaincrew-kr/blockchain-hackathon/issues/9) | A         |
| `balances[]` 권리자별 잔액      | —                                                                   | B 워터폴  |
| Explorer 링크                   | —                                                                   | B·C 실 tx |

### 임의 결정 검토 — [#15](https://github.com/chaincrew-kr/blockchain-hackathon/issues/15)

구현하며 기준 문서에 없거나 어긋나게 정한 값·규칙을 전수 정리해 올렸다.
특히 **무료 발권 상한이 기준 문서 안에서 5%(계약서 제5조)와 15%(P3 임계값)로
갈려 있고**, 현재 판정문은 제5조를 인용하면서 15% 계열 숫자를 말한다. 계약서와
화면을 나란히 보면 드러나는 불일치라 데모 전에 반드시 정리해야 한다.

⛔ 항목을 기다리는 동안 A·B 구간(T1~T6)을 끝내두면, IDL이 들어오는 시점에 D가
병목이 되지 않는다.

---

## 권장 순서

1. ~~**T1** Docker~~ ✅ 완료
2. ~~**T2** 배치 API 견고성~~ ✅ 완료
3. **T4** 픽스처 확대 — 회귀 안전망을 먼저 깔고 T5·T6을 건드린다
4. **T5** Gemini — D5 완료 기준이자 심사 감점 항목
5. **T3** CORS — A의 배포 URL 나오면 즉시 마무리
6. **T6** Anchor 골격 — IDL 도착 대비
7. **T7~T9** Cloud Run 배포 — `gcloud` 준비되는 대로
8. ⛔ 해제되는 순서대로 D 구간 연결
