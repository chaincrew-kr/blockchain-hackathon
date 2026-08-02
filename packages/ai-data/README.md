# ai-data — AI·외부 데이터 통합 [담당: A]

A가 소유하는 서버 측 AI·데이터 코드입니다. API 키가 브라우저 번들에 포함되지
않도록 `apps/web`이 아니라 이 패키지에 둡니다.

현재 제공 기능:

- `GeminiNarrativeGenerator`: D의 판정 결과를 Gemini 자연어 리포트로 변환
- `templateNarrative`: Gemini 키·네트워크 장애 시 결정론적 폴백
- `ContractTerms`: 계약 상한과 판정 근거 조항
- `KobisClient`: KOBIS 일별 박스오피스 조회 및 응답 정규화

`apps/agent`는 이 패키지를 호출하지만 프롬프트·응답 파싱의 소유자는 A입니다.
공용 입출력 타입은 `@chaincrew/schema`를 사용합니다.
