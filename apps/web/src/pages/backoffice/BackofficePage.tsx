/**
 * STAGE 0 — 계약 온보딩 백오피스.
 * PDF 업로드 → Gemini 추출(apps/web/server) → 충돌 확인 → 양측 승인 → init_escrow.
 *
 * 업로드 전에는 업로드 카드만 보이고, 추출 결과/승인/온체인 등록 블록은
 * 실제 추출이 끝나기 전까진 아예 렌더링하지 않는다 (가짜 데이터로 헷갈리지 않게).
 *
 * 다음 교체 지점(아직 안 됨):
 *   - "규칙 v1 승인" / "온체인 등록" 버튼 → B의 init_escrow(rule_hash, ver) 연결
 */
import { useEffect, useState } from "react";
import type { SettlementRule } from "@chaincrew/schema";

import { extractContract } from "../../lib/api";
import { adaptExtraction, type PartyNames } from "../../lib/adaptExtraction";
import { computeRuleHash, sha256Hex, toBps } from "../../lib/hash";

const STEPS = [
  { n: "01", t: "계약서 업로드", s: "now" },
  { n: "02", t: "Gemini 추출", s: "todo" },
  { n: "03", t: "충돌 확인 · 양측 승인", s: "todo" },
  { n: "04", t: "규칙 v1 확정", s: "todo" },
  { n: "05", t: "온체인 등록 init_escrow", s: "todo" },
];

export function BackofficePage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rule, setRule] = useState<SettlementRule | null>(null);
  const [parties, setParties] = useState<PartyNames | null>(null);

  async function handleExtract() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      // 계약서 원문 해시는 서버 응답과 무관하게 브라우저에서 직접 계산 (FR-06 원칙)
      const [apiResult, contractHash] = await Promise.all([
        extractContract(file),
        sha256Hex(await file.arrayBuffer()),
      ]);
      const { rule: settlementRule, parties: partyNames } = adaptExtraction(
        apiResult,
        contractHash,
      );
      setRule(settlementRule);
      setParties(partyNames);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  /** 승인 버튼 클릭 — 충돌이 남아있으면 승인 자체가 안 눌리게 막는다 (FR-04). */
  function approve(party: "distributor" | "theater") {
    setRule((prev) => {
      if (!prev || prev.conflicts.length > 0) return prev;
      return { ...prev, approvals: { ...prev.approvals, [party]: true } };
    });
  }

  const conflictCount = rule ? rule.conflicts.length : 0;
  const bothApproved = rule
    ? rule.approvals.distributor && rule.approvals.theater
    : false;

  // 양측 승인이 다 되면, 온체인과 같은 방식(D·B 확정 인코딩)으로 ruleHash를 계산해둔다.
  // 실제 init_escrow 호출은 D의 에이전트 엔드포인트가 나오면 그때 연결한다 — 아직은
  // "승인 후 화면에 정확한 해시가 보인다"까지만.
  useEffect(() => {
    if (!rule || !bothApproved || rule.ruleHash) return;
    let cancelled = false;
    computeRuleHash({
      ruleVersion: rule.version,
      theaterBps: toBps(rule.revenueShare.theater),
      distributorBps: toBps(rule.revenueShare.distributor),
      distributionFeeBps: toBps(rule.distributionFeeRate),
      investorProfitBps: toBps(rule.profitShare.investor),
    }).then((hash) => {
      if (!cancelled) {
        setRule((prev) => (prev ? { ...prev, ruleHash: hash } : prev));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [rule, bothApproved]);

  // 스텝 상태: 파일 선택 → 추출 → 충돌해결/승인 → 규칙 확정 순서로 진행
  const steps = STEPS.map((step, i) => {
    if (i === 0) return { ...step, s: file ? "done" : "now" };
    if (i === 1) return { ...step, s: rule ? "done" : file ? "now" : "todo" };
    if (i === 2)
      return { ...step, s: rule ? (bothApproved ? "done" : "now") : "todo" };
    if (i === 3) return { ...step, s: bothApproved ? "now" : "todo" };
    return step;
  });

  return (
    <section className="screen">
      <p className="eyebrow">
        <span className="chip-role">담당 A</span>
        <span className="chip-role">B — 온체인 등록</span> STAGE 0 — 계약 온보딩
      </p>
      <h1>계약 온보딩</h1>
      <p className="sub">
        상영계약서 PDF에서 Gemini가 정산 규칙을 추출합니다. 배급·상영 양측이
        승인해야 규칙 vN이 확정되고, 해시가 온체인에 등록된 뒤에는 AI도 변경할
        수 없습니다.
      </p>

      <div className="steps" role="list">
        {steps.map((s) => (
          <div key={s.n} className={`step ${s.s}`} role="listitem">
            <div className="n">{s.n}</div>
            <div className="t">{s.t}</div>
          </div>
        ))}
      </div>

      {/* ── 업로드 카드 ── */}
      <div className="card" style={{ marginTop: 24 }}>
        <h2>계약서 업로드</h2>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            marginTop: 12,
          }}
        >
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button
            className="pill"
            onClick={handleExtract}
            disabled={!file || loading}
          >
            {loading ? "추출 중…" : "Gemini로 추출"}
          </button>
        </div>
        {error && (
          <p
            className="chart-caption"
            style={{ color: "var(--stamp, #BE3A28)", marginTop: 10 }}
          >
            추출 실패: {error} — 서버(apps/web/server)가 localhost:8787에서 실행
            중인지 확인하세요.
          </p>
        )}
        {rule && (
          <p className="chart-caption" style={{ marginTop: 10 }}>
            추출 완료. 종합 신뢰도는 서버 응답 기준이며, 충돌이 있으면 낮게
            나오는 게 정상입니다.
          </p>
        )}
      </div>

      {!rule && (
        <p className="chart-caption" style={{ marginTop: 24 }}>
          PDF를 업로드하고 추출을 실행하면 결과가 여기 표시됩니다.
        </p>
      )}

      {rule && (
        <div className="grid">
          <div className="card">
            <h2>
              추출 결과{" "}
              <span className="muted">
                —{" "}
                {parties ? `${parties.movieTitle} (${file?.name})` : file?.name}{" "}
                · Gemini Structured Output
              </span>
            </h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>항목</th>
                    <th>추출 값</th>
                    <th>근거 조항</th>
                    <th className="num">신뢰도</th>
                  </tr>
                </thead>
                <tbody>
                  {rule.clauses.map((c) => (
                    <tr
                      key={c.field}
                      className={
                        "conflict" in c && c.conflict ? "conflict" : ""
                      }
                    >
                      <td>{c.field}</td>
                      <td className="mono">{c.value}</td>
                      <td className="clause">
                        {c.sourceClause} — “{c.sourceText}”
                      </td>
                      <td>
                        <span className="conf">
                          <span className="track">
                            <span
                              className="fill"
                              style={{ width: `${c.confidence * 100}%` }}
                            />
                          </span>
                          <span className="mono">
                            {c.confidence.toFixed(2)}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="chart-caption" style={{ marginTop: 18 }}>
              {conflictCount > 0
                ? `충돌 ${conflictCount}건이 열려 있습니다. 해결되기 전에는 양측 승인 버튼이 활성화되지 않습니다 — 규칙 생성은 항상 사람의 승인 뒤에 옵니다.`
                : "충돌 없음. 양측 승인을 진행할 수 있습니다."}
            </p>

            {conflictCount > 0 && (
              <ul style={{ marginTop: 12, paddingLeft: 18 }}>
                {rule.conflicts.map((c, i) => (
                  <li key={i} style={{ marginTop: 8, fontSize: 13.5 }}>
                    <span className="chip" style={{ marginRight: 8 }}>
                      {c.fields.join(", ")}
                    </span>
                    {c.description}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid approve-grid" style={{ marginTop: 0 }}>
            <div className="card">
              <h2>
                양측 승인 <span className="muted">— 2인 승인 필수</span>
              </h2>
              <div className="party">
                <div className="who">
                  배급 — {parties?.distributor ?? "(추출 안 됨)"}
                </div>
                <div className="sig">
                  {rule.approvals.distributor
                    ? "규칙 v1 승인함"
                    : "추출 결과 검토 중…"}
                </div>
                <div className="act">
                  <button
                    className="pill"
                    onClick={() => approve("distributor")}
                    disabled={conflictCount > 0 || rule.approvals.distributor}
                  >
                    규칙 v1 승인
                  </button>
                  <span
                    className={`chip ${rule.approvals.distributor ? "state-paid" : "state-dim"}`}
                  >
                    {rule.approvals.distributor ? "승인 완료" : "대기"}
                  </span>
                </div>
              </div>
              <hr className="hair" />
              <div className="party">
                <div className="who">
                  상영 — {parties?.theater ?? "(추출 안 됨)"}
                </div>
                <div className="sig">
                  {rule.approvals.theater
                    ? "규칙 v1 승인함"
                    : "추출 결과 검토 중…"}
                </div>
                <div className="act">
                  <button
                    className="pill"
                    onClick={() => approve("theater")}
                    disabled={conflictCount > 0 || rule.approvals.theater}
                  >
                    규칙 v1 승인
                  </button>
                  <span
                    className={`chip ${rule.approvals.theater ? "state-paid" : "state-dim"}`}
                  >
                    {rule.approvals.theater ? "승인 완료" : "대기"}
                  </span>
                </div>
              </div>
            </div>
            <div className="card">
              <h2>
                온체인 등록{" "}
                <span className="muted">— init_escrow(rule_hash, ver)</span>
              </h2>
              <div className="label">movieId (에스크로 PDA 시드)</div>
              <div className="hash-box" style={{ marginBottom: 14 }}>
                {rule.movieId}
              </div>
              <div className="label">
                계약서 원문 해시 (SHA-256, 브라우저 계산)
              </div>
              <div className="hash-box" style={{ marginBottom: 14 }}>
                {rule.contractHash}
              </div>
              <div className="label">규칙 해시 (SHA-256, 승인 후 확정)</div>
              <div className="hash-box">
                {rule.ruleHash ??
                  (bothApproved
                    ? "계산 중…"
                    : "b7a1 90c4 e2ff 08d3 5b6e 4a17 c9d0 22ab … (미확정)")}
              </div>
              <p className="chart-caption">
                양측 승인 완료 시 해시가 온체인에 기록됩니다. 이후 개정은{" "}
                <span className="mono" style={{ fontSize: 12 }}>
                  v2
                </span>{" "}
                신규 발행으로만 가능합니다.
              </p>
              <button
                className="pill"
                disabled
                title="B의 init_escrow 구현 후 연결 예정"
              >
                {bothApproved
                  ? "온체인 등록 (B 연동 대기)"
                  : "온체인 등록 (양측 승인 필요)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
