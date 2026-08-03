# 단일 HTML 종합 프로젝트·E2E 보고서

공유 파일은 `ChainCrew_Hackathon_Submission.html` 하나다. README의 프로젝트 목적·문제
정의, 제품 플로우, 시스템 아키텍처, 모듈별 책임, 사용·발표 순서, E2E 결과와
화면 캡처를 한 문서로 구조화했다. 화면 캡처와 커버는 PNG 파일을 참조하지 않고
`data:image/png;base64,...` URL로 HTML 내부에 포함된다. 아키텍처 시각화는
외부 라이브러리 없이 인라인 SVG로 들어간다.

인쇄·제출용은 `ChainCrew_Hackathon_Submission.pdf`를 사용한다. A4 26페이지로
생성했으며 제목, 카드, 표의 행과 화면 캡처가 페이지 경계에서 나뉘지 않도록
별도 인쇄 CSS를 적용했다.

제출본에는 저장소 내부 모듈 맵, 로컬 실행 명령, 테스트용 상태표와 리허설
체크리스트를 넣지 않는다. 그런 정보는 팀 내부 개발 문서에서만 관리한다.

## 다시 생성

루트에서 다음 명령을 실행한다.

```bash
python3 docs/e2e/build_report.py
```

생성기는 제품 화면인 `docs/manual/shots/*.png`와 기사·현장 조사 근거인
`docs/e2e/evidence/*.png`를 읽어 `report.template.html`의 이미지 자리표시자를
치환한다. 결과물에는 `file://` 링크가 없어야 하며, 다운로드 후 Chrome 또는
Edge에서 열면 폴더 없이 모든 이미지가 보인다.

Telegram 내부 미리보기는 로컬 HTML의 링크 이동을 제한할 수 있으므로 공유할 때
“파일 다운로드 후 Chrome/Edge에서 열기”라고 안내한다. PDF가 필요하면 브라우저의
인쇄 기능으로 별도 저장한다.
