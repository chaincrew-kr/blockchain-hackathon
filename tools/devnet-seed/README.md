# devnet-seed — devnet 테스트 escrow 시딩 (B·D 합동)

D의 `AnchorChainGateway`가 실제로 호출해볼 `MovieEscrow` 계정이 devnet에
하나도 없어서(이슈 #18) 만드는 도구. `init_escrow`의 `authority`가
`Signer`라 B 혼자 완결할 수 없고, D의 개인키를 주고받을 수도 없어서
**부분 서명(partial sign) 방식**으로 나눴다.

## 순서

**0. (한 번만) 극장·배급·제작·투자 지갑 준비 — B 또는 C**

```bash
npm run wallet:create -- theater
npm run wallet:create -- distributor
npm run wallet:create -- producer
npm run wallet:create -- investor
npm run wallet:address -- .secrets/theater-devnet.json   # 주소 확인
```

`init_escrow`가 실제로 쓰는 건 `theater` 주소뿐이지만, D의 `.env`가
4개 다 요구하므로([docs/ponyo_work/DEVNET_E2E.md](../../docs/ponyo_work/DEVNET_E2E.md)
참고) 한 번에 만들어서 D에게 4개 주소 전부 넘긴다.

**1. B — 민트 생성 + init_escrow 트랜잭션 절반 서명**

```bash
SOLANA_PROGRAM_ID=<Anchor.toml의 devnet program id> \
THEATER_WALLET=<위에서 만든 theater 주소> \
AUTHORITY_PUBKEY=<D의 agent 지갑 공개키> \
npm run build-init --workspace=@chaincrew/devnet-seed
```

`.secrets/devnet-seed-init-escrow.unsigned.b64`(서명 절반 된 트랜잭션)와
`.secrets/devnet-seed-state.json`(movie_id·mint·escrow 주소 등)이 생긴다.
**`.unsigned.b64`의 내용을 그대로 D에게 전달**(blockhash 유효시간이
짧으니 받는 즉시 2단계로 넘어가야 함).

**2. D — 나머지 서명 + 제출**

```bash
AUTHORITY_KEYPAIR_PATH=.secrets/agent-devnet.json \
TX_FILE=<B가 보낸 .unsigned.b64 파일 경로> \
npm run sign-submit --workspace=@chaincrew/devnet-seed
```

**3. B — 입금(deposit)까지 마무리**

`init_escrow`가 devnet에 confirm된 걸 확인한 뒤:

```bash
npm run fund --workspace=@chaincrew/devnet-seed
```

`payer` 서명만 필요해서 D 없이 B 혼자 끝낼 수 있다. 완료되면
`escrow.pending`에 잔액이 생겨서 D의 `settleBatch`/`markDisputed`가
실제로 처리할 대상이 생긴다(D 쪽 코드가 필요하면 `verify_escrow`도
알아서 먼저 호출함).

## 이후 D에게 전달할 값 (`.env`용)

`.secrets/devnet-seed-state.json`에 다 들어있다:

- `ESCROW_MOVIE_ID` = `movieId`
- `SOLANA_PROGRAM_ID` = `programId`
- `THEATER_WALLET`/`DISTRIBUTOR_WALLET`/`PRODUCER_WALLET`/`INVESTOR_WALLET`
  = 0단계에서 만든 4개 주소(state 파일엔 theater만 있음, 나머지 3개는
  0단계 출력에서 가져올 것)
- `THEATER_BPS`/`DISTRIBUTOR_BPS`/`DISTRIBUTION_FEE_BPS`/`INVESTOR_PROFIT_BPS`
  = 이 스크립트가 쓴 값과 **정확히 일치**해야 함(다르면 `RuleHashMismatch`)
