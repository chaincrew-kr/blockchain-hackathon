# B 담당 — 남은 일 전체 목록

> 마지막 갱신: 2026-08-01. 우선순위는 `docs/ponyo_work/DEADLINE.md`의
> "8/3까지 필요한 것 vs 8/21까지 미뤄도 되는 것" 기준을 따랐다.
> 완료된 것은 `README.md`(구현 완료·PR 이력)를 참고 — 여기는 **남은 것만** 적는다.

## 0. 지금 당장 (다음 세션 시작하면 바로)

1. **새 PR 생성 + dev merge** — 오늘 진행분(rule_hash 검증, dispute_count, theater 필드, 0원 무료 발권, 풀 워터폴)이 `feat/escrow-fund-flow`에 커밋만 돼 있고 아직 PR이 없음. gh CLI 미인증이라 못 올림. compare 링크: `https://github.com/chaincrew-kr/blockchain-hackathon/compare/dev...feat/escrow-fund-flow`
2. **D에게 전달 필요 — `init_escrow`/`settle_batch` 시그니처가 또 바뀜**:
   - `init_escrow(movie_id, theater: Pubkey, contract_hash, rule_hash, rule_version, mg_amount: u64, investment_amount: u64)` — `theater`·`mg_amount`·`investment_amount` 3개 인자 추가
   - `settle_batch(screening_id, amount, theater_bps, distributor_bps, distribution_fee_bps, investor_profit_bps: u16)` — `investor_profit_bps` 1개 추가, 계정도 `investor_allocation`/`investor_wallet` 2개 추가(항상 필요, 투자자 없는 영화도 0으로 생성됨)
   - `dispute_count: u32`는 계정 필드로 확정(`mark_disputed`에서 증가) — `getProgramAccounts(theater memcmp)`로 이제 실제로 상영관별 집계 가능(`theater` 필드 추가됐으므로)
   - IDL은 `packages/schema/idl`에 최신 반영해둠
3. **A에게 전달 필요**:
   - `init_escrow` 호출 전 `apps/web/src/lib/hash.ts`의 `computeRuleHash({ ruleVersion, theaterBps, distributorBps, distributionFeeBps, investorProfitBps })`로 계산한 값을 `ruleHash`로 넘겨야 함 (필드 5개로 늘어남)
   - `deposit`이 이제 `amount = 0`(무료 발권)을 허용함 — 무료 티켓 버튼에서 그대로 호출하면 됨
   - `init_escrow`에 `theater`(상영관 지갑 주소)·`mg_amount`·`investment_amount` 인자가 추가로 필요함 — 계약서에 MG·투자 조항이 없으면 둘 다 0으로 넘기면 됨

## 1. 팀 결정 필요 (B 혼자 못 정함 — 결정되면 바로 구현 가능)

4. **Devnet 배포 여부·시점** — `docs/ponyo_work/DEADLINE.md`(D, 7/31 D-3: "IDL 공유+Devnet 배포+D·A 연결")와 `Anchor.toml` 주석("Devnet 이전은 8/1 이후", 실행계획서 §4 8/1 일정과 일치)이 상충한다. 팀 확인 후 진행. 결정되면: `solana config set --url devnet` → devnet 지갑 펀딩 → `solana program deploy --use-rpc` → Program ID/RPC를 이슈 #17 체크박스에 공유

## 2. B 단독 구현 가능 (설계는 정해짐, 시간 되면)

(현재 없음 — 풀 워터폴·이슈 #5 필드는 오늘 구현 완료. 새로 생기면 여기 추가)

## 3. 문서 정리 (코드 변경 없음)

5. GitHub 이슈 #5, #6, #7, #8, #17에 코멘트/종료 처리 — gh 인증되면 README·SCHEMA_CONTRACT.md 내용 그대로 옮기면 됨 (#7·#17은 이미 충족 확인함, 닫기만 하면 됨. #5·#6·#8은 이번 세션 진행분 코멘트 필요)

## 4. 팀 전체 일정 중 B가 참여해야 하는 것 (실행계획서 §4)

6. **8/1(토) 통합 테스트** — A·B·C·D 전부 이어붙여서 구매→입금→판정→분배 E2E 1회 성공시키는 날. B 쪽에서 확인할 것: `deposit`/`settle_batch`/`init_escrow`가 A(구매 웹)·D(정산 에이전트)가 실제로 호출하는 형태와 맞는지 — 특히 오늘 늘어난 인자들(`theater`/`mg_amount`/`investment_amount`/`investor_profit_bps`)을 A·D가 실제로 채워서 호출하는지 그 자리에서 검증. 그리고 D의 `AnchorChainGateway.callInstruction`(아직 스텁, IDL은 이미 나와 있음)이 실제로 연결됐는지도 확인
7. **8/2~8/3 제출물 준비** — 프로덕트 소개서·데모 영상·README 정리는 전원 참여 (별도 역할 없음, `README (B) 이력`은 이미 정리돼 있어서 재사용 가능)

## 참고 — 이번 세션(2026-08-01)에서 이미 확인/해결한 것 (다시 안 해도 됨)

- **`rule_hash` 온체인 검증 인코딩 확정 + 구현** — `sha256("{ruleVersion}|{theaterBps}|{distributorBps}|{distributionFeeBps}|{investorProfitBps}")`(TicketEvent 해시체인과 동일한 "|" join 방식, 이후 풀 워터폴 추가로 필드 5개로 확장). `settle_batch.rs`에 검증 추가, `apps/web/src/lib/hash.ts`에 `computeRuleHash()` 헬퍼 추가. `docs/SCHEMA_CONTRACT.md` §11·§4 갱신 완료
- **`dispute_count` 계정 필드 결정 + 구현** — 이벤트 집계 대신 `MovieEscrow.dispute_count: u32`로 결정(`mark_disputed`에서 1씩 증가). `anomalyCount`는 `mark_disputed`처럼 확실한 온체인 트리거가 없어서(임계 미달 이상 패턴을 나중에 Gemini로 플래그하는 기능은 아직 미구현) 온체인 미기록으로 잠정 결론
- **이슈 #5 완결 — `theater: Pubkey` 필드** — `MovieEscrow`에 추가, `init_escrow`에서 설정. `dispute_count`와 합쳐져서 D의 `RpcHistoryProvider`가 `getProgramAccounts(theater memcmp)`로 상영관별 이력을 실제로 집계할 수 있게 됨
- **0원 무료 발권 허용(이슈 #8 잔여 항목 해결)** — 팀 결정: `deposit`의 `require!(amount > 0)` 제거, `amount == 0`이면 SPL transfer 자체를 생략. `tests/deposit.test.ts`의 "rejects a zero-amount deposit"를 "accepts a zero-amount deposit" 테스트로 교체
- **`settle_batch` 풀 워터폴 구현(이슈 #7)** — 부과금→VAT→부율 분할→배급수수료→MG 상환→투자 상환→이익 배분(Producer/Investor) 전부 구현. `MovieEscrow`에 `mg_remaining`/`investment_remaining` 필드 추가, `init_escrow`에서 계약 총액으로 초기화, `settle_batch`가 회차마다 한도까지 상환 후 남는 금액만 `investor_profit_bps`로 Producer/Investor 분배. `investor_allocation`/`investor_wallet` 계정 추가(4개 권리자 항상 생성). `SettledEvent`에 `mg_recoup`/`investment_recoup`/`investor_profit` 필드 추가해 D가 워터폴 각 단계를 감사할 수 있게 함
- `programs/movie_escrow/src/state.rs:11` 불변식① 주석 정리 — "+refunded"로 확정해 모호한 메모 제거
- `MovieEscrow.batch_count` 주석 정리 — "배치" 단위가 아니라 "회차 호출 횟수"라는 현재 의미를 명시
- PR #36(`feat/escrow-fund-flow → dev`) 머지 완료 — CI가 `docs/youn_work/README.md` prettier 포맷 문제로 막혀 있던 것도 같이 해결
- IDL 재생성 + `packages/schema/idl/` 갱신 (오늘 추가된 필드·계정·인자 전부 반영)
- 테스트: `init_escrow`/`deposit`/`refund_pending`/`verify_escrow`/`settle_batch` 5개 파일 전부 새 시그니처로 갱신, 신규 "full waterfall" 테스트 추가 — 총 18개 전부 통과 확인

## 참고 — 2026-07-31 세션에서 확인/해결한 것

- 이슈 #6(settle_batch 시그니처 불일치) — 해결, `feat/escrow-fund-flow`에 반영
- 이슈 #7(EscrowStatus 열거형) — 이미 충족돼 있었음, 확인만 함
- 이슈 #17(데모 최소 경로 5개 instruction) — 5개 다 구현 완료, IDL 공유 완료. 남은 건 Devnet 공유(위 4번)뿐
- 이슈 #8(해시체인 산식) — screening_id/seat/timestamp(ms) 부분은 해결, 0원 무료 발권만 남음(위에서 해결)
- `authority` 서명 검증 — `init_escrow` 포함 전체 instruction에 적용 완료
