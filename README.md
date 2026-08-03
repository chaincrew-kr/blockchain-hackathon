<div align="center">

**[한국어](README.md) · [English](README-ENG.md)**

<br />

<img src="assets/brand/movie-escrow-logo-web-final.png" width="90%" alt="MovieEscrow 로고" />

<h1>MovieEscrow</h1>

**독립영화 티켓 매출을 계약대로 분리하고 지급하는 AI 온체인 정산 인프라**

계약서를 실행 가능한 규칙으로 바꾸고, 결제금을 영화별 Escrow에 격리합니다.
정상 금액은 권리자별로 귀속하고 문제가 있는 금액만 분리해 보류합니다.

<br />

[![Live Demo](https://img.shields.io/badge/LIVE-DEMO-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)](https://chaincrew-web-612802760361.asia-northeast3.run.app)
[![Project Deck](https://img.shields.io/badge/PROJECT-DECK-7867C7?style=for-the-badge&logo=canva&logoColor=white)](https://canva.link/xl9hzx1jjj2uyuc)

<br />

![Solana Devnet](https://img.shields.io/badge/SOLANA-DEVNET-14F195?style=flat-square&logo=solana&logoColor=111111)
![Gemini](https://img.shields.io/badge/GEMINI-STRUCTURED_OUTPUT-8E75B2?style=flat-square&logo=googlegemini&logoColor=white)
![Google Cloud](https://img.shields.io/badge/GOOGLE_CLOUD-LIVE-4285F4?style=flat-square&logo=googlecloud&logoColor=white)
![Tests](https://img.shields.io/badge/AUTOMATED_TESTS-49_PASS-FF6B6B?style=flat-square)

<br />

<em>AI는 돈을 임의로 나누지 않습니다. 사람이 승인한 결정론적 규칙이 분배를
실행하고, AI는 계약 해석과 집행 전 검증·이상 탐지를 담당합니다.</em>

</div>

---

## Demo & Submission

| 제출물       | 링크·상태                                                                               |
| ------------ | --------------------------------------------------------------------------------------- |
| Live Demo    | [Google Cloud Run에서 실행](https://chaincrew-web-612802760361.asia-northeast3.run.app) |
| Demo Video   | YouTube 업로드 후 공개 영상 URL 연결 예정                                               |
| Project Deck | [Canva에서 프로젝트 소개서 보기](https://canva.link/xl9hzx1jjj2uyuc)                    |

심사용 Live Demo 접속정보는 제출 채널을 통해 별도로 전달합니다.

---

## Overview

국내 영화 티켓 매출은 극장 운영사나 예매 사업자에게 먼저 집중된 뒤 배급사,
제작사와 투자자에게 사후 정산됩니다. 중간 사업자에게 유동성 문제나 회생·파산이
발생하면 이미 판매된 표의 권리자 몫까지 운영자금과 함께 묶일 수 있습니다.

**MovieEscrow**는 티켓 결제금을 영화별 Solana 에스크로 PDA로 직접
유입시켜 사업자의 자금과 분리합니다. AI 에이전트는 사람이 승인한 계약 규칙과
회차별 발권·환불 입력, 과거 상영관 이력과 온체인 계정 상태를 검증합니다. 정상
금액은 권리자별로 귀속하고, 문제가 있는 회차·금액만 `Disputed` 상태로 격리한 뒤
각 권리자가 자기 몫을 인출합니다.

<p align="center">
  <img src="assets/readme/movie-escrow-settlement-visual.png" width="100%" alt="티켓 결제금이 영화별 에스크로를 거쳐 권리자별로 분리 정산되는 MovieEscrow 비주얼" />
</p>

<p align="center"><em>하나의 에스크로에서 정상 금액은 계속 흐르고, 이상 금액만 별도로 격리됩니다.</em></p>

초기 대상은 새로운 결제·정산 레일을 빠르게 적용할 수 있는 **독립·예술영화
전용관, 영화제와 공동체 상영 조직**입니다. 관객용 암호화폐 서비스가 아니라,
관객 결제 뒤에서 작동하는 **B2B 정산 인프라**입니다.

---

## Why We Built This

2026년 메가박스중앙의 회생절차 과정에서 제작·수입·배급사와 위탁상영 사업자의
미지급 정산금 문제가 현실화됐습니다. 영화인연대는 이 정산채권이 영화산업의
제작·배급·상영 순환을 구성한다는 점을 강조하며 중소 사업자 보호와 정산금 분리
관리를 요구했습니다. 이후 보도에서는 배급사 미지급금이 약 150억 원, 전국 70여
개 위탁상영관의 미정산액이 약 70억~80억 원으로 추정됐습니다.

- [영화인연대 — 메가박스중앙 미지급 정산금 문제에 대한 입장문](https://kifv.org/725)
- [연합뉴스 — 메가박스 악재에 돈줄 막힌 영화계](https://www.yna.co.kr/view/AKR20260717054700005)

<table>
  <tr>
    <td width="50%"><a href="https://kifv.org/725"><img src="docs/e2e/evidence/kifv-unpaid-settlement.png" alt="영화인연대 미지급 정산금 입장문 화면" /></a></td>
    <td width="50%"><a href="https://www.yna.co.kr/view/AKR20260717054700005"><img src="docs/e2e/evidence/yonhap-unpaid-settlement.png" alt="메가박스 미지급 정산금 관련 연합뉴스 보도 화면" /></a></td>
  </tr>
  <tr>
    <td align="center"><sub>영화인연대 입장문 · 2026. 7. 9.</sub></td>
    <td align="center"><sub>연합뉴스 보도 · 2026. 7. 19.</sub></td>
  </tr>
</table>

이 사례가 보여준 문제는 “매출 데이터가 보이지 않는다”는 것만이 아닙니다. 관객이
이미 낸 돈 가운데 권리자에게 돌아가야 할 몫이 중간 사업자의 운영자금과 분리되지
않아, 한 사업자의 재무 위험이 영화 생태계 전체의 현금흐름으로 전파된다는
점입니다.

### KOBIS 다음에 필요한 것

[KOBIS 영화관입장권통합전산망](https://www.kobis.or.kr/kobis/business/main/main.do)은
전국 영화관의 발권정보를 실시간으로 집계해 매출 데이터와 영화산업 통계의
투명성을 높입니다. 그러나 영화별 계약을 해석하거나 권리자별 금액을 격리하고 실제
지급을 실행하는 시스템은 아닙니다.

2026년 7월 씨네큐브와 서울아트시네마에 같은 항목을 서면으로 물었습니다. 두 곳
모두 발권 데이터를 Excel로 추출할 수 있었지만 KOBIS 전송은 한 곳이 상영일 다음
날 새벽 일괄, 다른 한 곳이 실시간 자동 방식이었습니다. 씨네큐브 답변에서는
할인·쿠폰을 반영한 유효매출 기준이 극장마다 다를 수 있고 영화별 별도계약도
존재한다고 확인했습니다.

| 현장에서 확인한 차이                         | MovieEscrow 설계 반영                                      |
| -------------------------------------------- | ---------------------------------------------------------- |
| KOBIS 전송 시점이 익일 일괄·실시간으로 다름  | 극장 발권 원장·솔루션을 1차 입력, KOBIS는 사후 대조로 사용 |
| 유효매출 기준이 할인·쿠폰 정책마다 다름      | 영화별 `SettlementRule`과 적용 버전을 양측이 승인          |
| Excel 추출은 가능하지만 API는 추가 확인 필요 | Excel/API를 공통 `TicketEvent`로 바꾸는 어댑터 구조        |

이 조사는 전체 영화관을 대표하는 통계가 아니라 제품 가설을 점검한 정성 조사입니다.
응답자 이름·이메일·회신 화면은 공개하지 않았습니다.
[2개 극장 현장 조사 종합](docs/research/FIELD_RESEARCH_SUMMARY_2026-07.md)

```text
KOBIS
→ 얼마가 판매됐는지 저장·집계

MovieEscrow
→ 어떤 계약 규칙을 적용할지 확정
→ 공제와 권리자별 몫 계산
→ 자금 격리
→ 정상 금액 지급
→ 이상 금액만 보류
```

> **KOBIS가 영화별 매출의 발생 사실을 보여주는 데이터 인프라라면,
> MovieEscrow는 그 데이터를 승인된 계약 규칙과 실제 자금 흐름에 연결해 권리자의
> 몫을 확정·격리·지급하는 실행 인프라입니다.**

---

## Problem

| 대상                 | 현재 겪는 문제                                                               |
| -------------------- | ---------------------------------------------------------------------------- |
| 극장·상영자          | 매출과 정산 대상 금액이 운영자금에 섞이고, 수작업 정산 부담이 큽니다.        |
| 배급사·제작사·투자자 | 언제 어떤 규칙으로 얼마가 계산됐는지 실시간으로 확인하기 어렵습니다.         |
| 정산 담당자          | 계약 해석, 공제 계산, 발권·환불 대조와 지급이 분리돼 오류 추적이 어렵습니다. |
| 모든 권리자          | 이상 한 건이 발생하면 정상 금액까지 함께 정산이 중단될 수 있습니다.          |

핵심 문제는 단순히 계산이 느리다는 것이 아닙니다. **돈이 처음부터 권리자별로
보호되지 않고**, 계산과 지급의 근거를 제3자가 즉시 검증하기 어렵다는 구조적
문제입니다.

---

## Solution — 계약대로 흐르고, 문제 금액만 멈춥니다

| Problem                             | MovieEscrow의 설계 응답                                                |
| ----------------------------------- | ---------------------------------------------------------------------- |
| 권리자 몫이 중간 사업자의 돈과 섞임 | 결제 순간 영화별 PDA Vault로 보내 운영자금과 분리                      |
| 계약 해석과 계산 근거가 불투명함    | Gemini 추출 → 양측 승인 → 규칙 해시·버전을 온체인에 고정               |
| 이상 한 건이 전체 정산을 멈춤       | 정상 금액은 계속 귀속하고 영향받은 회차·금액만 `Disputed`로 격리       |
| 계산·지급·증빙이 서로 분리됨        | Agent 판단, Anchor 실행과 Explorer 트랜잭션을 하나의 대시보드에서 연결 |

### 실행 흐름

1. Gemini가 계약서에서 부율·수수료·MG·공제·정산일을 근거 조항과 함께
   구조화합니다.
2. 배급사와 상영자가 추출 결과를 확인하고 승인합니다.
3. 양측 승인이 끝나면 Phantom 서명으로 `init_escrow`를 호출해 계약·규칙 해시와
   버전, 영화별 Vault를 Solana에 등록합니다.
4. 관객의 티켓 결제금이 개인키가 없는 해당 영화의 에스크로 Vault로 직접
   들어갑니다.
5. 정산 에이전트가 회차별 발권·환불 입력, 과거 상영관 이력과 온체인 계정 상태를
   바탕으로 환불률, 무료 발권과 좌석 초과를 검증합니다.
6. 정상 회차는 승인된 규칙으로 귀속·분배하고 이상 회차의 금액만 보류합니다.
7. 대시보드에서 상태, 잔액, 트랜잭션과 AI 판단 근거를 확인합니다.

> **핵심 차별점 — 부분 보류:** 1,000 중 50에만 이상이 있다면 950의 정상 정산은
> 계속 진행하고 50만 격리합니다. 문제 하나로 전체 정산을 멈추지 않습니다.

---

## Why Solana?

MovieEscrow가 Solana를 선택한 이유는 관객에게 암호화폐 사용을 강요하기 위해서가
아닙니다. **영화별 계약 규칙, 격리된 돈과 실행 결과를 하나의 검증 가능한 상태로
묶기 위해서**입니다.

<p align="center">
  <img src="assets/readme/why-solana.svg" width="100%" alt="MovieEscrow가 Solana를 사용하는 네 가지 이유: PDA 에스크로, 원자적 실행, 회차 단위 처리와 공개 검증" />
</p>

| Solana 특성        | MovieEscrow 구현                                                                       | 정산에서 생기는 효과                                                       |
| ------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 개인키 없는 PDA    | `movie_id`로 영화별 Escrow PDA와 역할별 Allocation PDA를 결정론적으로 파생합니다.      | 극장·배급사 어느 한쪽도 Vault의 돈을 임의로 꺼낼 수 없습니다.              |
| 프로그램 규칙 집행 | `deposit`, `settle_batch`, `mark_disputed`, `claim`이 Anchor 프로그램 검사를 거칩니다. | 사람이 승인한 규칙과 계정 제약을 통과한 상태 변경만 실행됩니다.            |
| 원자적 트랜잭션    | 한 배치의 권리자별 귀속과 에스크로 상태 갱신이 같은 실행 단위에서 처리됩니다.          | 일부만 기록된 중간 상태를 남기지 않고 전체가 성공하거나 전체가 취소됩니다. |
| 낮은 실행 오버헤드 | 정상 회차 정산과 이상 금액 보류를 회차·권리자 단위 instruction으로 분리했습니다.       | 작은 금액을 자주 처리하고 문제 금액만 정밀하게 멈추는 구조에 맞습니다.     |
| 공개 검증 가능성   | 트랜잭션 서명, slot, 이벤트와 계정 상태를 대시보드·Explorer에서 연결합니다.            | 정산 당사자가 같은 실행 기록과 현재 잔액을 직접 확인할 수 있습니다.        |

즉 Solana는 MovieEscrow의 결제 장식이 아니라 **중립적인 정산 실행 레이어**입니다.
AI가 이상 여부와 근거를 제안하면, Solana 프로그램이 권한·금액·상태 전이를 다시
검사하고 승인된 범위만 실행합니다.

<sub>기술 근거: [Program Derived Address](https://solana.com/ko/docs/core/pda) · [원자적 트랜잭션 실행](https://solana.com/docs/intro/quick-start/writing-to-network) · [트랜잭션 수수료 구조](https://solana.com/docs/core/fees)</sub>

---

## Key Features

| 기능             | 설명                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| 계약 → 규칙      | Gemini가 정산 조건과 근거 조항을 추출하고, 양측 승인 후 `init_escrow`로 규칙 해시·버전을 등록합니다.  |
| 결제 순간 격리   | Phantom 서명으로 보낸 Devnet USDC가 영화별 에스크로 Vault에 직접 유입되어 운영자금과 섞이지 않습니다. |
| 위험조정검증     | 과거 이력에 따라 임계값을 조정하고 환불률·무료 발권·좌석 초과를 검사합니다.                           |
| 부분 보류        | 문제가 있는 회차·금액만 `Disputed`로 격리하고 정상분 지급은 중단하지 않습니다.                        |
| 인출 제한        | 각 권리자는 자기 `Claimable` 잔액까지만 인출할 수 있으며 초과 요청은 온체인에서 거부됩니다.           |
| 설명 가능한 판단 | Gemini가 적용 정책, 근거 조항과 보류 사유를 자연어 리포트로 생성합니다.                               |
| 투명 대시보드    | 상태머신, 권리자별 잔액, Explorer 링크와 판단 로그를 공개합니다.                                      |

---

## Product Walkthrough

<table>
  <tr>
    <td width="50%"><img src="docs/manual/shots/03-contract-upload.png" alt="계약서 업로드와 Gemini 규칙 추출 화면" /></td>
    <td width="50%"><img src="docs/manual/shots/04-contract-result.png" alt="계약 조건 추출과 충돌 확인 화면" /></td>
  </tr>
  <tr>
    <td align="center"><strong>1. 계약서 업로드</strong><br /><sub>상영계약서에서 정산 규칙과 근거 조항을 추출합니다.</sub></td>
    <td align="center"><strong>2. 충돌 검토·승인</strong><br /><sub>충돌이 있으면 승인을 막고, 합의된 규칙만 확정합니다.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/manual/shots/01-purchase.png" alt="Phantom 지갑을 이용한 티켓 구매 화면" /></td>
    <td width="50%"><img src="docs/manual/shots/05-dashboard-overview.png" alt="MovieEscrow 정산 대시보드 화면" /></td>
  </tr>
  <tr>
    <td align="center"><strong>3. 티켓 결제·격리</strong><br /><sub>결제금이 영화별 Escrow Vault로 직접 유입됩니다.</sub></td>
    <td align="center"><strong>4. 부분 보류 정산</strong><br /><sub>정상 금액과 보류 금액, 권리자별 잔액을 함께 확인합니다.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/manual/shots/06-dashboard-evidence.png" alt="AI 판정 근거와 정책 검사 결과 화면" /></td>
    <td width="50%"><img src="docs/manual/shots/07-dashboard-kobis.png" alt="KOBIS 대조 정보와 온체인 트랜잭션 화면" /></td>
  </tr>
  <tr>
    <td align="center"><strong>5. 판정 근거 공개</strong><br /><sub>적용 정책과 이상 탐지 근거를 사람이 확인할 수 있습니다.</sub></td>
    <td align="center"><strong>6. 외부 대조·검증</strong><br /><sub>KOBIS 정보와 Explorer 기록을 한 화면에서 대조합니다.</sub></td>
  </tr>
</table>

---

## Settlement Flow

### 1. 계약 확정과 결제금 격리

```mermaid
flowchart TB
  Contract["계약서 업로드"] --> Gemini["Gemini 규칙 추출"]
  Gemini --> Approval["배급사·상영자 승인"]
  Approval --> Rule["규칙 해시·버전 고정"]
  Rule --> Init["Phantom init_escrow 서명<br/>테스트 Mint·Vault 생성"]
  Init --> Escrow["영화별 Escrow PDA·Vault"]
  Payment["Phantom Devnet 서명<br/>USDC 티켓 결제"] --> Escrow
```

### 2. 검증과 부분 보류 정산

```mermaid
flowchart TB
  Escrow["영화별 Escrow 잔액"] --> Risk["위험조정검증"]
  Batch["회차별 발권·환불 데이터"] --> Risk["위험조정검증"]
  KOBIS["KOBIS 익일 사후 대조"] -.-> Risk
  Risk --> Judge{"정산 판단"}
  Judge -->|정상| Settle["권리자별 Allocation 귀속"]
  Judge -->|이상| Hold["이상 금액만 Disputed"]
  Settle --> Dashboard["투명 대시보드"]
  Hold --> Dashboard
  Dashboard --> Claim["권리자 Claim·Explorer"]
```

---

## System Architecture

```mermaid
flowchart TB
  subgraph Web["React Web"]
    Ticket["티켓 구매"]
    Backoffice["계약 백오피스"]
    Dashboard["정산 대시보드"]
  end

  subgraph Agent["Settlement Agent · Node/Express"]
    Verify["STAGE 3 위험조정검증"]
    Judge["STAGE 4 정산 판단"]
    Logs["판단 로그 API"]
  end

  subgraph Solana["Solana Devnet"]
    Program["MovieEscrow · Anchor"]
    PDA["영화별 Escrow PDA"]
  end

  Gemini["Gemini API"]
  Cloud["Cloud Run · Secret Manager<br/>Scheduler · Cloud Logging"]

  Backoffice --> Gemini
  Backoffice -->|init_escrow| Program
  Ticket --> Program
  Program --> PDA
  PDA --> Verify
  Verify --> Judge
  Judge --> Program
  Judge --> Logs
  Logs --> Dashboard
  Agent -.-> Cloud
```

| 서비스           | 책임                                               | 주요 연결                                     |
| ---------------- | -------------------------------------------------- | --------------------------------------------- |
| React Web        | 계약 승인, 구매 시연, 정산 결과 시각화             | Gemini, Agent API, Solana                     |
| Settlement Agent | 이력 조회, 정합성 검증, 정산 판단, 체인 호출       | Solana RPC, Gemini, Dashboard                 |
| MovieEscrow      | 자금 격리, 귀속, 부분 보류, 인출 제한과 분쟁 해결  | Solana Devnet                                 |
| Google Cloud     | Web·Agent 배포, 인증 배치 트리거, 로그·비밀값 관리 | Cloud Run, Secret Manager, Scheduler, Logging |

---

## Live Demo

제출 빌드는 Google Cloud Run에서 바로 확인할 수 있습니다.

> **[MovieEscrow Live Demo 열기](https://chaincrew-web-612802760361.asia-northeast3.run.app)**

심사용 로그인 정보는 제출 채널을 통해 별도로 전달합니다.

<details>
<summary><strong>Local Development · Docker</strong></summary>

### Prerequisites

Docker Desktop 또는 Docker Engine과 Compose 플러그인이 필요합니다. Gemini·KOBIS 기능을
직접 호출하려면 `.env`에 각 API 키를 입력합니다.

```bash
git clone https://github.com/chaincrew-kr/blockchain-hackathon.git
cd blockchain-hackathon
cp .env.example .env
docker compose up --build
```

| 서비스           | 주소                           |
| ---------------- | ------------------------------ |
| MovieEscrow Web  | `http://localhost:4020`        |
| Settlement Agent | `http://localhost:4030/health` |

종료할 때는 `docker compose down`을 실행합니다. 기본 구성은 별도 서명키 없이 제품
흐름을 확인하는 로컬 개발 환경입니다.

#### Docker 없이 실행

```bash
npm install
npm run dev:agent
npm run dev:web
```

전체 검사는 `npm run check`로 실행합니다.

</details>

---

## Repository Structure

```text
blockchain-hackathon/
├── apps/
│   ├── web/                 # 구매 웹 · 계약 백오피스 · 대시보드
│   └── agent/               # 위험조정검증 · 정산 판단 · 로그 API
├── packages/
│   ├── ai-data/             # Gemini 판정 설명 · KOBIS 클라이언트
│   └── schema/              # 팀 공용 TypeScript 인터페이스 · IDL
├── programs/
│   └── movie_escrow/        # Anchor 에스크로 프로그램
├── tools/
│   ├── devnet-seed/         # 공동 서명 init · 테스트 민트 · Escrow 시딩
│   └── wallet/              # Localnet·Devnet 지갑 도구
├── scripts/
│   └── demo-claim.ts        # Claim · 초과 인출 · 분쟁 해제 리허설
├── docs/                    # 제출 보고서 · 사용자 매뉴얼 · 현장 조사
├── assets/                  # 브랜드 · README · 보고서 이미지
├── Anchor.toml
├── Cargo.toml
└── package.json
```

---

## Tech Stack

<div align="center">

<strong>Frontend &amp; Wallet</strong><br />
<img src="https://img.shields.io/badge/React_19-20232A?style=for-the-badge&amp;logo=react&amp;logoColor=61DAFB" alt="React 19" />
<img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&amp;logo=typescript&amp;logoColor=white" alt="TypeScript" />
<img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&amp;logo=vite&amp;logoColor=white" alt="Vite" />
<img src="https://img.shields.io/badge/Phantom-AB9FF2?style=for-the-badge&amp;logo=phantom&amp;logoColor=white" alt="Phantom Wallet" />

<br /><br />

<strong>Agent &amp; AI</strong><br />
<img src="https://img.shields.io/badge/Node.js-5FA04E?style=for-the-badge&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js" />
<img src="https://img.shields.io/badge/Express_5-111111?style=for-the-badge&amp;logo=express&amp;logoColor=white" alt="Express 5" />
<img src="https://img.shields.io/badge/Gemini-8E75B2?style=for-the-badge&amp;logo=googlegemini&amp;logoColor=white" alt="Gemini" />
<img src="https://img.shields.io/badge/Structured_Output-6C5CE7?style=for-the-badge" alt="Gemini Structured Output" />

<br /><br />

<strong>On-chain Settlement</strong><br />
<img src="https://img.shields.io/badge/Solana_Devnet-14F195?style=for-the-badge&amp;logo=solana&amp;logoColor=111111" alt="Solana Devnet" />
<img src="https://img.shields.io/badge/Anchor_0.31-5965E8?style=for-the-badge&amp;logo=anchor&amp;logoColor=white" alt="Anchor 0.31" />
<img src="https://img.shields.io/badge/Rust-CE422B?style=for-the-badge&amp;logo=rust&amp;logoColor=white" alt="Rust" />
<img src="https://img.shields.io/badge/PDA_Escrow-9945FF?style=for-the-badge" alt="PDA Escrow" />
<img src="https://img.shields.io/badge/Devnet_USDC-2775CA?style=for-the-badge&amp;logo=usdcoin&amp;logoColor=white" alt="Devnet USDC" />

<br /><br />

<strong>Google Cloud</strong><br />
<img src="https://img.shields.io/badge/Cloud_Run-4285F4?style=for-the-badge&amp;logo=googlecloud&amp;logoColor=white" alt="Google Cloud Run" />
<img src="https://img.shields.io/badge/Secret_Manager-EA4335?style=for-the-badge&amp;logo=googlecloud&amp;logoColor=white" alt="Secret Manager" />
<img src="https://img.shields.io/badge/Scheduler-F9AB00?style=for-the-badge&amp;logo=googlecloud&amp;logoColor=white" alt="Cloud Scheduler" />
<img src="https://img.shields.io/badge/Logging-34A853?style=for-the-badge&amp;logo=googlecloud&amp;logoColor=white" alt="Cloud Logging" />

<br /><br />

<strong>Quality</strong><br />
<img src="https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&amp;logo=vitest&amp;logoColor=white" alt="Vitest" />
<img src="https://img.shields.io/badge/ESLint-4B32C3?style=for-the-badge&amp;logo=eslint&amp;logoColor=white" alt="ESLint" />
<img src="https://img.shields.io/badge/Prettier-F7B93E?style=for-the-badge&amp;logo=prettier&amp;logoColor=111111" alt="Prettier" />
<img src="https://img.shields.io/badge/49_Tests-Passing-FF6B6B?style=for-the-badge&amp;logo=checkmarx&amp;logoColor=white" alt="49 tests passing" />

</div>

---

## Verified on Devnet

2026년 8월 3일 제출 빌드에서 아래 흐름을 검증했습니다.

| 검증 항목        | 결과                                                                     |
| ---------------- | ------------------------------------------------------------------------ |
| 계약 온보딩      | PDF 업로드, Gemini 규칙 추출, 충돌 탐지, 양측 승인과 `init_escrow` 연결  |
| 관객 결제        | Phantom Wallet Adapter를 통한 Devnet USDC `deposit`                      |
| 온체인 정산      | Devnet 프로그램 배포, 실제 `settle_batch` 2건과 `mark_disputed` 4건 기록 |
| 분쟁·인출        | 정상 Claim, 초과 인출 거부, 분쟁 중 인출 거부와 해제 후 Claim            |
| Settlement Agent | 위험 검증, 정상·부분 보류 판정, Anchor 트랜잭션 실행과 판단 로그 API     |
| Cloud 배포       | Web·Agent Cloud Run, Secret Manager, 인증 Scheduler와 Cloud Logging      |
| 자동 검사        | Agent 42개, AI Data 4개, Devnet Seed 3개 — 총 49개 통과                  |

---

## Team

|                                                            진규빈                                                            |                                                           정서윤                                                           |                                                        최상아                                                        |                                                           박세령                                                           |
| :--------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------: |
| <a href="https://github.com/kyubinjin"><img src="https://github.com/kyubinjin.png" width="100" alt="진규빈 프로필 사진"></a> | <a href="https://github.com/youn1205"><img src="https://github.com/youn1205.png" width="100" alt="정서윤 프로필 사진"></a> | <a href="https://github.com/jj8ng"><img src="https://github.com/jj8ng.png" width="100" alt="최상아 프로필 사진"></a> | <a href="https://github.com/ryeong03"><img src="https://github.com/ryeong03.png" width="100" alt="박세령 프로필 사진"></a> |
|                                                  **A · Frontend / AI Data**                                                  |                                                 **B · Chain / Fund Flow**                                                  |                                          **C · Chain / Decision Execution**                                          |                                               **D · Agent / Decision Logic**                                               |
|                                     계약 온보딩 · 구매 웹<br>대시보드 · Gemini 프롬프트                                      |                                      에스크로 초기화 · 입금<br>환불 · 배치 귀속·정산                                       |                                          인출 제한 · 부분 보류<br>분쟁 해결                                          |                                       위험조정검증 · 정산 판단<br>Express API · 배포                                       |
|                                          [@kyubinjin](https://github.com/kyubinjin)                                          |                                          [@youn1205](https://github.com/youn1205)                                          |                                          [@jj8ng](https://github.com/jj8ng)                                          |                                          [@ryeong03](https://github.com/ryeong03)                                          |

---

## License

본 프로젝트는 [MIT License](LICENSE) 하에 배포됩니다.

<br />

<div align="center">

<img src="assets/brand/movie-escrow-logo-v2.png" width="96" alt="MovieEscrow 엠블럼" />

**Google Cloud × Solana AI Agentic Commerce Hackathon**

_Team ChainCrew — Kyubin Jin · Seoyoon Jung · Sanga Choi · Seryeong Park_

</div>
