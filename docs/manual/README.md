# ChainCrew 사용자 매뉴얼 자동 캡처

`tools/capture.py`가 실제 Cloud Run 웹을 Chrome으로 열어 화면을 조작하고,
브라우저가 측정한 요소 좌표에 빨간 테두리와 번호를 합성한다. 결과는
`shots/*.png`에 저장되며 `index.html`에서 바로 사용한다.

## 실행

```bash
python3 -m venv /tmp/chaincrew-manual-venv
/tmp/chaincrew-manual-venv/bin/pip install \
  -r docs/manual/tools/requirements.txt

MANUAL_BASIC_PASSWORD="$(gcloud secrets versions access 2 \
  --secret=web-demo-password \
  --project=chaincrew-movie-escrow)" \
MANUAL_ALLOW_PAID_API=true \
  /tmp/chaincrew-manual-venv/bin/python docs/manual/tools/capture.py
```

`MANUAL_ALLOW_PAID_API=true`는 Gemini 계약서 추출을 실제 1회 호출한다. 평소
재캡처에서는 이 변수를 빼서 유료 API의 반복 호출을 막는다.

일부 컷만 다시 저장하려면 파일명에서 `.png`를 뺀 이름을 인자로 전달한다.

```bash
MANUAL_BASIC_PASSWORD="$(gcloud secrets versions access 2 \
  --secret=web-demo-password \
  --project=chaincrew-movie-escrow)" \
  /tmp/chaincrew-manual-venv/bin/python docs/manual/tools/capture.py \
  01-purchase 05-dashboard-overview
```

## 자동화 범위와 제한

- 실제 수행: 화면 전환, Phantom 미설치 오류 확인, PDF 선택, Gemini 추출,
  KOBIS 로딩 확인, 화면 캡처와 좌표 주석
- 수행하지 않음: Phantom 개인키 주입, 실제 티켓 결제, 정산 배치 재실행,
  리허설 초기화
- 이유: 현재 배포된 프론트는 Solana RPC가 localnet 기본값이며, 기존 Devnet
  Escrow는 정산을 마친 상태다. 안전한 신규 Escrow와 테스트 지갑이 준비되기
  전에는 온체인 변경 호출을 자동화하지 않는다.
