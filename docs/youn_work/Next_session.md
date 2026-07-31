# B 담당 — 남은 일 전체 목록

> 작성: 2026-07-31 세션 종료 시점 기준. 우선순위는 `docs/ponyo_work/DEADLINE.md`의
> "8/3까지 필요한 것 vs 8/21까지 미뤄도 되는 것" 기준을 따랐다.
> 완료된 것은 `README.md`(구현 완료·PR 이력)를 참고 — 여기는 **남은 것만** 적는다.

## 0. 지금 당장 (다음 세션 시작하면 바로)

1. **커밋 `7744c63` PR 생성 + dev merge** — `deposit`/`refund_pending`에 `screening_id`/`seat` 추가한 건. gh CLI 미인증이라 아직 못 올림. `feat/escrow-fund-flow → dev`, compare 링크: `https://github.com/chaincrew-kr/blockchain-hackathon/compare/dev...feat/escrow-fund-flow`
2. **D에게 전달** — 이슈 #6·#8 답변(새 instruction 시그니처). README "다음 할 일"에 전달용 문구 있음:
   - `settle_batch(screening_id: String, amount: u64, theater_bps: u16, distributor_bps: u16, distribution_fee_bps: u16)`
   - `deposit`/`refund_pending`에 `screening_id: String, seat: String` 추가, `timestamp`는 이제 ms 단위
3. **A에게 전달** — 인터페이스 변경 3건:
   - `init_escrow` 호출 시 `authority` 서명 필요 (co-sign)
   - `deposit`/`refund_pending` 호출 시 `screening_id`/`seat` 인자 필요
   - IDL은 `packages/schema/idl`에 최신 반영돼 있음

## 1. 팀 결정 필요 (B 혼자 못 정함 — 결정되면 바로 구현 가능)

4. **Devnet 배포 여부·시점** — `docs/ponyo_work/DEADLINE.md`(D, 7/31 D-3: "IDL 공유+Devnet 배포+D·A 연결")와 `Anchor.toml` 주석("Devnet 이전은 8/1 이후", 실행계획서 §4 8/1 일정과 일치)이 상충한다. 팀 확인 후 진행. 결정되면: `solana config set --url devnet` → devnet 지갑 펀딩 → `solana program deploy --use-rpc` → Program ID/RPC를 이슈 #17 체크박스에 공유
5. **0원 무료 발권을 체인에 포함할지** (이슈 #8 잔여 항목) — 지금 `deposit`은 `require!(amount > 0)`이라 무료 티켓이 로그에 안 남아서, D의 무료 발권 비율(P3) 검증이 온체인 데이터로는 항상 0%가 됨. `amount == 0` 허용으로 바꾸면 `tests/deposit.test.ts`의 "rejects a zero-amount deposit" 테스트도 같이 바뀌어야 함
6. **`rule_hash` 온체인 검증 인코딩 방식** (B·D, `docs/SCHEMA_CONTRACT.md` §11) — `SettlementRule` → `rule_hash` 해시가 어떤 직렬화·알고리즘인지 합의되면, `settle_batch`의 `*_bps` 인자를 이 해시와 대조하는 검증을 추가해서 "코드가 규칙을 강제한다" 서사를 완성. 지금은 authority 서명만으로 신뢰 중

## 2. B 단독 구현 가능 (설계는 정해짐, 시간 되면)

7. **`settle_batch` 풀 워터폴** — MG 상환·투자 상환·이익 배분. `settle_batch.rs` 핸들러 하단에 로직 주석으로 위치만 잡아둠. 필요 작업: `MovieEscrow`에 `mg_remaining: u64`, `investment_remaining: u64` 필드 추가(+ IDL/공간 재계산), Investor Allocation PDA 추가(`init_if_needed`, seed `BeneficiaryRole::Investor as u8`)
8. **이슈 #5 — 상영관 이력 조회용 필드** — `MovieEscrow`에 `theater: Pubkey` 추가해야 D의 `RpcHistoryProvider`(지금은 `FixtureHistoryProvider`로 대체 중)가 실제로 동작함. `anomalyCount`/`disputeCount`를 계정 필드로 둘지 `mark_disputed` 이벤트를 D가 직접 집계할지도 같이 정해야 함 (이슈 본문에 필드 대조표 있음)

## 3. 문서 정리 (코드 변경 없음)

9. `docs/SCHEMA_CONTRACT.md` §11 갱신 — "권리자 잔액"(이슈 #6로 해결됨), `ruleHash` 인코딩(6번 항목과 연동), "금액 타입 string vs number"(B·D) 행 정리
10. GitHub 이슈 #6, #7, #8, #17에 코멘트/종료 처리 — gh 인증되면 README 내용 그대로 옮기면 됨 (#7·#17은 이미 충족 확인함, 닫기만 하면 됨)
11. `programs/movie_escrow/src/state.rs:11` — 불변식① 주석에 `"=> +refunded? -refunded?"`라는 확인 안 된 메모가 남아있음. 정답은 "+refunded"가 맞음(refund_pending이 gross_in을 안 건드리므로) — 주석만 정리하면 됨. 사소하지만 헷갈리는 문서라 다음에 지나가다 보이면 지울 것
12. `MovieEscrow.batch_count` — 이제 "배치" 단위가 아니라 "settle_batch 호출(=회차) 횟수"를 세는 걸로 의미가 바뀜(이슈 #6 재설계 결과). 기능상 문제는 없지만 필드명·주석이 옛 의미(배치)를 그대로 두고 있어서 나중에 헷갈릴 수 있음

## 4. 팀 전체 일정 중 B가 참여해야 하는 것 (실행계획서 §4)

13. **8/1(토) 통합 테스트** — A·B·C·D 전부 이어붙여서 구매→입금→판정→분배 E2E 1회 성공시키는 날. B 쪽에서 확인할 것: `deposit`/`settle_batch`/`init_escrow`가 A(구매 웹)·D(정산 에이전트)가 실제로 호출하는 형태와 맞는지 그 자리에서 검증
14. **8/2~8/3 제출물 준비** — 프로덕트 소개서·데모 영상·README 정리는 전원 참여 (별도 역할 없음, `README (B) 이력`은 이미 정리돼 있어서 재사용 가능)

## 참고 — 이번 세션에서 이미 확인/해결한 것 (다시 안 해도 됨)

- 이슈 #6(settle_batch 시그니처 불일치) — 해결, `feat/escrow-fund-flow`에 반영
- 이슈 #7(EscrowStatus 열거형) — 이미 충족돼 있었음, 확인만 함
- 이슈 #17(데모 최소 경로 5개 instruction) — 5개 다 구현 완료, IDL 공유 완료. 남은 건 Devnet 공유(위 4번)뿐
- 이슈 #8(해시체인 산식) — screening_id/seat/timestamp(ms) 부분은 해결, 0원 무료 발권만 남음(위 5번)
- `authority` 서명 검증 — `init_escrow` 포함 전체 instruction에 적용 완료
