/**
 * STAGE 6 — 투명 대시보드. 모든 숫자는 온체인 계정에서 직접 읽는 것이 원칙.
 * 목업: mocks/demo.ts 고정 데이터. 실제 연동 시 교체 지점:
 *   - snapshot → apps/agent `GET /api/snapshot` 폴링 + 에스크로 계정 구독
 *   - 차트 → KOBIS 오픈API 일별 박스오피스 (실존 독립영화 1편)
 *   - tx 링크 → Solana Explorer (?cluster=devnet)
 */
import type { CheckResult, EscrowStatus } from "@chaincrew/schema";

import { BarChart } from "../../components/BarChart";
import {
  checks,
  decision,
  demoDaily,
  kobisDaily,
  snapshot,
} from "../../mocks/demo";

const STATUS_ORDER: EscrowStatus[] = [
  "pending",
  "verified",
  "allocated",
  "paid",
];
const STATUS_LABEL: Record<EscrowStatus, string> = {
  pending: "Pending",
  verified: "Verified",
  allocated: "Allocated",
  paid: "Paid",
  disputed: "Disputed",
};
const ROLE_LABEL: Record<string, string> = {
  theater: "극장",
  distributor: "배급",
  producer: "제작",
  investor: "투자",
};
const CHECK_LABEL: Record<CheckResult["check"], string> = {
  "refund-rate": "환불률 (P3)",
  "free-rate": "무료 발권 비율 (P3)",
  "over-issue": "발권수 ≤ 좌석수 (P4)",
  "hash-chain": "발권 로그 해시 연속성 (P5)",
};

const usdc = (v: number) => v.toFixed(1);
const time = (ts: number) =>
  new Date(ts).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const checkValue = (c: CheckResult) =>
  c.check === "hash-chain"
    ? `${c.observed} ${c.threshold}`
    : `${c.observed} ${c.passed ? "≤" : ">"} ${c.threshold}`;

export function DashboardPage() {
  const partsSum =
    snapshot.pending +
    snapshot.allocated +
    snapshot.disputed +
    snapshot.paidOut +
    snapshot.refunded;
  const invariantHolds = Math.abs(partsSum - snapshot.grossIn) < 1e-6;
  const nowIndex = STATUS_ORDER.indexOf(snapshot.status);

  const stats = [
    { k: "총 유입", v: snapshot.grossIn },
    { k: "Pending", v: snapshot.pending },
    { k: "귀속 확정", v: snapshot.allocated },
    { k: "보류 격리", v: snapshot.disputed, hold: true },
    { k: "지급 완료", v: snapshot.paidOut },
    { k: "환불", v: snapshot.refunded },
  ];

  return (
    <section className="screen">
      <p className="eyebrow">
        <span className="chip-role">담당 A</span>
        <span className="chip-role">D — 로그 API</span> STAGE 6 — 투명 대시보드
        · 전 권리자 공개
      </p>
      <h1>《미광》 정산 현황</h1>
      <p className="sub">
        모든 숫자는 온체인 계정에서 직접 읽습니다. 판정은 에이전트가 내리지만,
        근거는 전부 여기 공개됩니다.
      </p>

      <div className="flow" aria-label="에스크로 상태머신">
        {STATUS_ORDER.map((s, i) => (
          <span key={s} style={{ display: "contents" }}>
            {i > 0 && <span className="arrow">→</span>}
            <span
              className={`node${i < nowIndex ? " past" : i === nowIndex ? " now" : ""}`}
            >
              {STATUS_LABEL[s]}
            </span>
          </span>
        ))}
        {snapshot.disputed > 0 && (
          <>
            <span className="arrow" style={{ marginLeft: 10 }}>
              ⌥
            </span>
            <span className="node branch">
              ⚠ Disputed {usdc(snapshot.disputed)} USDC
            </span>
          </>
        )}
        <button className="ghost">정산일 도래 — 시간 압축 ▸</button>
      </div>

      <div className="grid stats">
        {stats.map((s) => (
          <div key={s.k} className={`stat${s.hold ? " hold" : ""}`}>
            <div className="k">{s.k}</div>
            <div className="v">
              {usdc(s.v)} <small>USDC</small>
            </div>
          </div>
        ))}
      </div>
      <p className="invariant">
        불변식 {invariantHolds ? "✓" : "✕ 위반!"} {usdc(snapshot.pending)} +{" "}
        {usdc(snapshot.allocated)} + {usdc(snapshot.disputed)} +{" "}
        {usdc(snapshot.paidOut)} + {usdc(snapshot.refunded)} = {usdc(partsSum)}{" "}
        = 총 유입
      </p>

      <div className="grid two-col">
        <div className="card">
          <h2>
            AI 판정 근거 <span className="muted">— STAGE 4 · Gemini 생성</span>
          </h2>
          <div className="verdict-head">
            <span
              className={`chip ${decision.verdict === "partial-hold" ? "state-hold" : "state-live"}`}
            >
              {decision.verdict === "partial-hold" ? "부분 보류" : "진행"}
            </span>
            <span
              className="mono"
              style={{ fontSize: 11, color: "var(--smoke)" }}
            >
              {new Date(decision.decidedAt).toLocaleString("ko-KR", {
                dateStyle: "short",
                timeStyle: "short",
              })}{" "}
              · 회차 {decision.screeningId}
            </span>
          </div>
          <p className="serif" style={{ marginTop: 14, color: "var(--mist)" }}>
            {decision.narrative}
          </p>
          <div className="checks">
            {checks.map((c) => (
              <div
                key={c.check}
                className={`check ${c.passed ? "pass" : "fail"}`}
              >
                <span className="mark">{c.passed ? "✓" : "✕"}</span>
                <span>{CHECK_LABEL[c.check]}</span>
                <span className="mono">{checkValue(c)}</span>
              </div>
            ))}
          </div>
          <p className="chart-caption">
            임계값은 상영관 온체인 이력으로 조정됩니다 — 신규 상영관이라
            기본값보다 30% 엄격하게 적용 중.
          </p>
        </div>

        <div className="card">
          <h2>
            권리자별 잔액 <span className="muted">— Allocation 계정</span>
          </h2>
          <div className="bene">
            {snapshot.balances.map((b) => (
              <div key={b.role} className="row">
                <span className="who">{ROLE_LABEL[b.role]}</span>
                <span className="track">
                  {b.claimed > 0 && (
                    <i
                      className="claimed"
                      style={{
                        width: `${(b.claimed / snapshot.grossIn) * 100}%`,
                      }}
                    />
                  )}
                  <i
                    className="claimable"
                    style={{
                      width: `${(b.claimable / snapshot.grossIn) * 100}%`,
                    }}
                  />
                </span>
                <span className="amt">
                  {usdc(b.claimed)} 지급 · {usdc(b.claimable)} 인출가능
                </span>
              </div>
            ))}
          </div>
          <div className="legend">
            <span>
              <i style={{ background: "var(--white)" }} />
              지급 완료
            </span>
            <span>
              <i style={{ background: "var(--violet-mark)" }} />
              인출 가능
            </span>
            <span>
              <i style={{ background: "var(--frost)" }} />
              전체 대비
            </span>
          </div>
          <hr className="hair" />
          <h2 style={{ marginBottom: 10 }}>tx 타임라인</h2>
          <div className="timeline">
            {snapshot.timeline.map((t) => (
              <div
                key={t.label}
                className={`tl${t.label.includes("거부") ? " reject" : ""}`}
              >
                <span className="t">{time(t.timestamp)}</span>
                <span className="what">
                  {t.label}
                  <small>{t.txSignature}</small>
                </span>
                <a
                  className="ex"
                  href="https://explorer.solana.com/?cluster=devnet"
                  target="_blank"
                  rel="noreferrer"
                >
                  Explorer ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid chart-pair">
        <div className="card">
          <h2>
            《미광》 일별 발권 <span className="muted">— 우리 데모 · 건</span>
          </h2>
          <BarChart
            data={demoDaily}
            unit=" 건"
            color="var(--violet-mark)"
            gridStep={2}
          />
        </div>
        <div className="card">
          <h2>
            실존 독립영화 일별 관객{" "}
            <span className="muted">— KOBIS 오픈API · 명</span>
          </h2>
          <BarChart
            data={kobisDaily}
            unit=" 명"
            color="rgba(255,255,255,.45)"
            gridStep={100}
          />
          <p className="chart-caption">
            단위가 다르므로 축을 공유하지 않습니다 — 같은 기간의 실데이터를
            나란히 보여 “실제 시장과 연결된 파이프라인”임을 증명하는 패널.
          </p>
        </div>
      </div>
    </section>
  );
}
