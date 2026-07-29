# D 작업 백로그 — 남에게 안 막히는 것부터

> 기준일: 2026-07-30
> 범위 정의는 [README.md](README.md), 막힌 항목은 GitHub 이슈 [#5](https://github.com/chaincrew-kr/blockchain-hackathon/issues/5)~[#9](https://github.com/chaincrew-kr/blockchain-hackathon/issues/9).

`feature/agent-settlement-pipeline` 기준으로 STAGE 3·4 로직은 fixture/stub으로
완주한다(타입 검사 통과, 테스트 13개 통과). 이 문서는 **그 다음에 D가 무엇을
어떤 순서로 하는가**만 다룬다.

원칙: **B·C·A의 결정을 기다려야 하는 일과 아닌 일을 섞지 않는다.** 기다리는 동안
할 수 있는 일이 아직 많이 남아 있다.

## 범례

- ✅ 완료 · 🟡 진행 가능(의존성 없음) · ⛔ 이슈 대기 · 🔑 외부 계정 인증 필요

---

## A. 지금 혼자 가능 — 의존성 0

### T1 🟡 Docker 이미지 (최우선)

저장소에 정산 에이전트용 Dockerfile이 아직 없다(`legacy/x402-api/Dockerfile`만
존재). Cloud Run·Scheduler·Secret Manager·라이브 URL이 전부 D 주담당인데
착수율이 0%다. **제출 요건인 라이브 URL의 유일한 경로이면서, 체인 연결을 전혀
기다리지 않는 작업이다.**

- [ ] `apps/agent/Dockerfile` 작성 — 모노레포 workspace 빌드 고려
- [ ] `.dockerignore` 작성 — `node_modules`, `.env`, `.secrets` 제외
- [ ] 로컬 빌드 후 컨테이너 실행
- [ ] 컨테이너에서 `/health` 200 확인
- [ ] 컨테이너에서 `POST /api/batch/trigger` → 판정 2건 반환 확인
- [ ] `PORT` 환경변수 수용 (Cloud Run이 주입하는 값 — 현재는 `AGENT_PORT`만 읽음)

### T2 🟡 배치 API 견고성

[README.md](README.md)의 Express 백엔드 항목 중 미완 3건. 전부 D 단독 영역이다.

- [ ] **멱등성** — 현재 `POST /api/batch/trigger`를 두 번 호출하면 두 번 다
      실행되고 store를 덮어쓴다. 데모에서 버튼을 연타하면 이중 정산이 된다.
      실행 중 락 + 완료 결과 캐시로 막는다.
- [ ] **4xx / 5xx 구분** — `routes/batch.ts`가 현재 모든 예외를 500으로 반환한다.
      잘못된 입력은 4xx, 체인·내부 오류는 5xx로 나눈다.
- [ ] **구조화 로그** — 현재 `console.error` 한 줄뿐. Cloud Logging이 파싱할 수
      있게 JSON 한 줄 형식으로 바꾸고 판정·오류에 상관관계 ID를 넣는다.

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

로컬에 `gcloud` CLI가 설치돼 있지 않다. 스크립트·설정·문서는 미리 준비할 수
있지만 실제 배포 명령은 세령 계정 인증이 필요하다.

### T7 🔑 Cloud Run

- [ ] `gcloud` CLI 설치 및 로그인
- [ ] GCP 프로젝트·리전 결정 후 팀에 공유
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

⛔ 항목을 기다리는 동안 A·B 구간(T1~T6)을 끝내두면, IDL이 들어오는 시점에 D가
병목이 되지 않는다.

---

## 권장 순서

1. **T1** Docker — 유일하게 0%인 제출 요건이고 의존성이 없다
2. **T2** 배치 API 견고성 — T1 하는 김에 같이 (이중 정산은 데모 사고 위험)
3. **T4** 픽스처 확대 — 회귀 안전망을 먼저 깔고 T5·T6을 건드린다
4. **T5** Gemini — D5 완료 기준이자 심사 감점 항목
5. **T3** CORS — A의 배포 URL 나오면 즉시 마무리
6. **T6** Anchor 골격 — IDL 도착 대비
7. **T7~T9** Cloud Run 배포 — `gcloud` 준비되는 대로
8. ⛔ 해제되는 순서대로 D 구간 연결
