/**
 * STAGE 6 — 투명 대시보드. 모든 숫자는 온체인 계정에서 직접 읽는 것이 원칙.
 *
 * 교체 진행 상황:
 *   - KOBIS 차트 → 실제 연동 완료 (apps/web/server /api/kobis/*)
 *   - "정산일 도래" 버튼 → 실제 연동 완료 (POST apps/agent /api/batch/trigger,
 *     lib/api.ts triggerBatch). 판정 근거·tx 타임라인은 트리거 후 실제 응답으로
 *     교체되고, 트리거 전엔 mocks/demo.ts 미리보기를 보여준다.
 *   - snapshot(잔액·상태머신) → 아직 목업 — /api/batch/trigger는 판정 결과만
 *     주고 온체인 잔액은 안 준다. 별도 스냅샷 API 나오면 교체.
 *   - tx 링크 → Solana Explorer (?cluster=devnet)
 */
import { useEffect, useState } from "react";
import type {
  BatchRunResponse,
  CheckResult,
  EscrowStatus,
} from "@chaincrew/schema";

import { BarChart } from "../../components/BarChart";
import {
  describeAgentError,
  fetchKobisDaily,
  fetchKobisMovieInfo,
  resetBatch,
  triggerBatch,
  type KobisDailyPoint,
  type KobisMovieInfo,
} from "../../lib/api";
import { checks, decision, demoDaily, snapshot } from "../../mocks/demo";
import { formatUsdc } from "../../lib/usdc";

type BatchState = "idle" | "running" | "done" | "error";

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
  const [kobisDaily, setKobisDaily] = useState<KobisDailyPoint[] | null>(null);
  const [kobisInfo, setKobisInfo] = useState<KobisMovieInfo | null>(null);
  const [kobisError, setKobisError] = useState<string | null>(null);

  const [batchState, setBatchState] = useState<BatchState>("idle");
  const [batchResult, setBatchResult] = useState<BatchRunResponse | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  useEffect(() => {
    fetchKobisDaily()
      .then(setKobisDaily)
      .catch((e) => setKobisError(String(e.message ?? e)));
    fetchKobisMovieInfo()
      .then(setKobisInfo)
      .catch((e) => setKobisError(String(e.message ?? e)));
  }, []);

  const handleTrigger = async () => {
    setBatchState("running");
    setBatchError(null);
    try {
      const result = await triggerBatch();
      setBatchResult(result);
      setBatchState("done");
    } catch (error) {
      setBatchError(describeAgentError(error));
      setBatchState("error");
    }
  };

  const handleReset = async () => {
    setBatchError(null);
    try {
      await resetBatch();
      setBatchResult(null);
      setBatchState("idle");
    } catch (error) {
      setBatchError(describeAgentError(error));
    }
  };

  const usingRealDecisions = batchResult !== null;
  const activeDecisions = batchResult ? batchResult.decisions : [decision];
  const activeTimeline = batchResult ? batchResult.timeline : snapshot.timeline;
  const fmt = usingRealDecisions ? formatUsdc : usdc;

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
      <p className="eyebrow">STAGE 6 — 투명 대시보드 · 전 권리자 공개</p>
      <h1>《붉은 노을 아래》 정산 현황</h1>
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
        <button
          className="ghost"
          disabled={batchState === "running"}
          onClick={handleTrigger}
        >
          {batchState === "running"
            ? "정산 배치 실행 중…"
            : "정산일 도래 — 시간 압축 ▸"}
        </button>
        {batchResult?.replayed && (
          <span className="chip state-dim">재생됨 — 기존 결과</span>
        )}
        {batchState === "done" && (
          <button className="ghost" onClick={handleReset}>
            리허설 초기화
          </button>
        )}
      </div>
      {batchError && (
        <p className="error-text" role="alert">
          {batchError}
        </p>
      )}

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
            AI 판정 근거{" "}
            <span className="muted">
              — STAGE 4 · Gemini 생성
              {!usingRealDecisions && " (미리보기 · 목업)"}
            </span>
          </h2>
          {activeDecisions.length === 0 && (
            <p className="chart-caption">
              이번 배치에는 판정 대상 회차가 없습니다.
            </p>
          )}
          {activeDecisions.map((d, i) => (
            <div
              key={d.screeningId}
              style={i > 0 ? { marginTop: 18, paddingTop: 18 } : undefined}
              className={i > 0 ? "bordered-top" : undefined}
            >
              <div className="verdict-head">
                <span
                  className={`chip ${d.verdict === "partial-hold" ? "state-hold" : "state-live"}`}
                >
                  {d.verdict === "partial-hold" ? "부분 보류" : "진행"}
                </span>
                <span
                  className="mono"
                  style={{ fontSize: 11, color: "var(--smoke)" }}
                >
                  {new Date(d.decidedAt).toLocaleString("ko-KR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}{" "}
                  · 회차 {d.screeningId}
                  {d.verdict === "partial-hold" &&
                    ` · 보류 ${fmt(d.heldAmount)} USDC`}
                </span>
              </div>
              <p
                className="serif"
                style={{ marginTop: 14, color: "var(--mist)" }}
              >
                {d.narrative}
              </p>
              {/* 실데이터 narrative는 D의 에이전트가 근거 조항을 문장 안에
                  이미 포함해서 생성한다 — mock 미리보기만 별도로 보여준다
                  (mock 문구엔 인용이 안 박혀 있어서 중복이 안 생김). */}
              {!usingRealDecisions && d.basisClauses.length > 0 && (
                <p className="chart-caption">
                  근거: {d.basisClauses.join(" · ")}
                </p>
              )}
            </div>
          ))}
          {!usingRealDecisions && (
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
          )}
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
          <h2 style={{ marginBottom: 10 }}>
            tx 타임라인{!usingRealDecisions && " (미리보기 · 목업)"}
          </h2>
          <div className="timeline">
            {activeTimeline.map((t, i) => (
              <div
                key={`${t.label}-${i}`}
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
            《붉은 노을 아래》 일별 발권{" "}
            <span className="muted">— 우리 데모 · 건</span>
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

          {kobisError && (
            <p
              className="chart-caption"
              style={{ color: "var(--stamp, #BE3A28)" }}
            >
              KOBIS 조회 실패: {kobisError} — 서버(apps/web/server)의
              KOBIS_API_KEY 설정과 localhost:8787 실행 상태를 확인하세요.
            </p>
          )}

          {!kobisError && !kobisDaily && (
            <p className="chart-caption">KOBIS에서 불러오는 중…</p>
          )}

          {kobisDaily && (
            <BarChart
              data={kobisDaily}
              unit=" 명"
              color="rgba(255,255,255,.45)"
              gridStep={100}
            />
          )}

          <p className="chart-caption">
            {kobisInfo
              ? `「${kobisInfo.movieName}」 (${kobisInfo.openDate.slice(0, 4)}-${kobisInfo.openDate.slice(4, 6)}-${kobisInfo.openDate.slice(6, 8)} 개봉, ${kobisInfo.directors[0] ?? "?"} 감독, ${kobisInfo.companies.find((c) => c.role === "배급사")?.name ?? "?"} 배급) — `
              : ""}
            일별 박스오피스 상위권 밖인 날은 0으로 표시됩니다. 단위가 다르므로
            축을 공유하지 않습니다 — 같은 기간의 실데이터를 나란히 보여 “실제
            시장과 연결된 파이프라인”임을 증명하는 패널.
          </p>
        </div>
      </div>
    </section>
  );
}
