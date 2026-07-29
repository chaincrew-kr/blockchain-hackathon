# movie_escrow — Solana 에스크로 프로그램 [담당: B·C]

한 프로그램을 B·C가 instruction 단위로 나눠 개발합니다 (실행계획서 §2).

| 담당 | instruction                                          | 스테이지         |
| ---- | ---------------------------------------------------- | ---------------- |
| B    | `init_escrow` `deposit` `refund_pending` `settle_batch` | S0b · S1 · S2  |
| C    | `claim` `mark_disputed` `resolve_dispute`            | S5               |

## 시작 전 필수 (7/29)

1. **`state.rs`의 `MovieEscrow`·`Allocation` 필드를 B·C가 함께 확정** — 현재
   내용은 초안입니다. 확정 없이 각자 짜기 시작하면 되돌리는 데 하루 이상
   걸립니다 (싱크 체크포인트).
2. D의 온체인 이력 조회가 필드명에 의존하므로, 확정 결과를 D에게도 공유.

## 빌드·공유

```bash
anchor build                                  # 레포 루트에서 (Anchor.toml 위치)
anchor keys sync                              # placeholder 프로그램 ID 교체
cp target/idl/movie_escrow.json packages/schema/idl/
cp target/types/movie_escrow.ts packages/schema/idl/
```

- 개발은 localnet(`solana-test-validator`), Devnet 이전은 8/1.
- 모든 스텁은 `NotImplemented` 에러를 반환합니다. 구현 시 각 파일의 TODO와
  불변식(①③=B, ②=C) 테스트를 함께 작성하세요.
- 7/30 마일스톤: **deposit → claim 왕복 + 타인 몫 claim 온체인 거부.**
