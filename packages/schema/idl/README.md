# idl — Anchor 프로그램 IDL 공유 위치

B·C가 `anchor build` 후 생성되는 IDL을 여기로 복사해 공유합니다.

```bash
anchor build
cp target/idl/movie_escrow.json packages/schema/idl/
cp target/types/movie_escrow.ts packages/schema/idl/
```

A(프론트)·D(에이전트)는 이 IDL로 프로그램을 호출합니다. instruction·계정 구조가
바뀔 때마다 다시 복사해야 하며, 이 폴더의 변경도 `src/index.ts`와 마찬가지로
전원 리뷰 대상입니다(전역 결정 G6).
