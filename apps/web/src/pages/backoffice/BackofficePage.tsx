/**
 * STAGE 0 — 계약 온보딩 백오피스.
 * PDF 업로드 → Gemini 추출(apps/web/server) → 충돌 확인 → 양측 승인 → init_escrow.
 *
 * 업로드 전에는 업로드 카드만 보이고, 추출 결과/승인/온체인 등록 블록은
 * 실제 추출이 끝나기 전까진 아예 렌더링하지 않는다 (가짜 데이터로 헷갈리지 않게).
 */
import { useEffect, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import type { SettlementRule } from "@chaincrew/schema";

import { PhantomIcon } from "../../components/PhantomIcon";
import { extractContract } from "../../lib/api";
import { adaptExtraction, type PartyNames } from "../../lib/adaptExtraction";
import { computeRuleHash, sha256Hex, toBps } from "../../lib/hash";
import {
  describeChainError,
  explorerTxUrl,
  getPhantomProvider,
  initEscrow,
  type PhantomProvider,
} from "../../lib/chain";

const STEPS = [
  { n: "01", t: "계약서 업로드", s: "now" },
  { n: "02", t: "Gemini 추출", s: "todo" },
  { n: "03", t: "충돌 확인 · 양측 승인", s: "todo" },
  { n: "04", t: "규칙 v1 확정", s: "todo" },
  { n: "05", t: "온체인 등록 init_escrow", s: "todo" },
];

export function BackofficePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rule, setRule] = useState<SettlementRule | null>(null);
  const [parties, setParties] = useState<PartyNames | null>(null);

  const [wallet, setWallet] = useState<PhantomProvider | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [theaterAddress, setTheaterAddress] = useState("");
  const [chainState, setChainState] = useState<
    "idle" | "connecting" | "submitting" | "done"
  >("idle");
  const [chainError, setChainError] = useState<string | null>(null);
  const [chainResult, setChainResult] = useState<{
    signature: string;
    usdcMint: string;
  } | null>(null);

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

  async function connectWallet() {
    setChainError(null);
    setChainState("connecting");
    try {
      const provider = getPhantomProvider();
      const { publicKey } = await provider.connect();
      setWallet(provider);
      setWalletAddress(publicKey.toBase58());
      // 데모 편의상 연결된 지갑을 상영관 주소 기본값으로 채워둔다 — 실제
      // 상영관 지갑이 따로 있으면 아래 입력창에서 바꾸면 된다.
      setTheaterAddress((prev) => prev || publicKey.toBase58());
      setChainState("idle");
    } catch (err) {
      setChainError(describeChainError(err));
      setChainState("idle");
    }
  }

  async function registerOnchain() {
    if (!wallet || !rule || !rule.ruleHash || !rule.contractHash) return;
    setChainError(null);

    let theater: PublicKey;
    try {
      theater = new PublicKey(theaterAddress.trim());
    } catch {
      setChainError("상영관 지갑 주소가 올바른 Solana 공개키 형식이 아닙니다.");
      return;
    }

    setChainState("submitting");
    try {
      const { signature, usdcMint } = await initEscrow(wallet, {
        movieId: rule.movieId,
        theater,
        contractHash: rule.contractHash,
        ruleHash: rule.ruleHash,
        ruleVersion: rule.version,
        // SettlementRule.minimumGuarantee는 통화 단위가 남아있지 않아
        // USDC 최소 단위로 안전하게 환산할 수 없다 — 잘못된 금액을 온체인에
        // 새기는 것보다 0(MG 없음)으로 등록하는 쪽이 안전하다. 추출
        // 스키마가 정규화된 USDC 금액을 내려주면 그때 연결한다.
        mgAmountSmallestUnit: 0,
        investmentAmountSmallestUnit: 0,
      });
      setChainResult({ signature, usdcMint: usdcMint.toBase58() });
      setChainState("done");
    } catch (err) {
      setChainError(describeChainError(err));
      setChainState("idle");
    }
  }

  const conflictCount = rule ? rule.conflicts.length : 0;
  const bothApproved = rule
    ? rule.approvals.distributor && rule.approvals.theater
    : false;

  // 양측 승인이 다 되면, 온체인과 같은 방식(D·B 확정 인코딩)으로 ruleHash를 계산해둔다.
  // init_escrow 호출은 이 해시가 준비된 뒤 "온체인 등록" 버튼에서 실행한다.
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
    if (i === 3)
      return {
        ...step,
        s: rule?.ruleHash ? "done" : bothApproved ? "now" : "todo",
      };
    if (i === 4)
      return {
        ...step,
        s: chainState === "done" ? "done" : rule?.ruleHash ? "now" : "todo",
      };
    return step;
  });

  return (
    <section className="screen">
      <p className="eyebrow">STAGE 0 — 계약 온보딩</p>
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
            flexWrap: "wrap",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ display: "none" }}
          />
          <button
            className="ghost"
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? "다른 파일 선택" : "PDF 파일 선택"}
          </button>
          {file && (
            <span
              className="mono"
              style={{ fontSize: 12, color: "var(--mist)" }}
            >
              {file.name}
            </span>
          )}
          <button
            className="pill"
            style={{ minWidth: 140 }}
            onClick={handleExtract}
            disabled={!file || loading}
          >
            {loading && <span className="spinner" />}
            {loading ? "추출 중…" : "Gemini로 추출"}
          </button>
        </div>
        {error && (
          <p
            className="chart-caption"
            style={{ color: "var(--stamp, #BE3A28)", marginTop: 10 }}
          >
            추출 실패: {error} — 서버(apps/web/server)의 상태를 확인하세요 (로컬
            개발 중이면 localhost:8787에서 떠 있는지 확인).
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
            <p
              className="chart-caption"
              style={{
                marginTop: 18,
                ...(conflictCount === 0 ? { color: "var(--success)" } : {}),
              }}
            >
              {conflictCount > 0
                ? `충돌 ${conflictCount}건이 열려 있습니다. 해결되기 전에는 양측 승인 버튼이 활성화되지 않습니다 — 규칙 생성은 항상 사람의 승인 뒤에 옵니다.`
                : "충돌 없음. 양측 승인을 진행할 수 있습니다."}
            </p>

            <div style={{ marginTop: 18 }}>
              <div className="label">보류 임계값 — 계약 상한과는 다른 층위</div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 8,
                }}
              >
                <span className="chip state-hold">
                  환불률 상한{" "}
                  {(rule.disputeThresholds.refundRate * 100).toFixed(1)}%
                </span>
                <span className="chip state-hold">
                  무료 발권 비율 상한{" "}
                  {(rule.disputeThresholds.freeTicketRate * 100).toFixed(1)}%
                </span>
              </div>
              <p className="chart-caption" style={{ marginTop: 8 }}>
                위 "무료 발권 상한" 조항(계약 위반 기준{" "}
                {(rule.freeTicketCapRate * 100).toFixed(1)}%)과는 다른 값입니다
                — 이 임계값을 넘으면 정산 에이전트가 해당 회차 금액을 자동으로
                보류합니다. 계약 위반이라고 곧바로 자금을 묶지 않기 위한
                완충입니다.
              </p>
            </div>

            {conflictCount > 0 && (
              <ul style={{ marginTop: 12, paddingLeft: 18 }}>
                {rule.conflicts.map((c, i) => (
                  <li key={i} style={{ marginTop: 8, fontSize: 13.5 }}>
                    <span
                      className="chip state-danger"
                      style={{ marginRight: 8 }}
                    >
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
                    className={`chip ${rule.approvals.distributor ? "state-success" : "state-dim"}`}
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
                    className={`chip ${rule.approvals.theater ? "state-success" : "state-dim"}`}
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
              {bothApproved && chainState !== "done" && (
                <div style={{ marginTop: 14 }}>
                  <div className="label">상영관 지갑 주소 (Solana pubkey)</div>
                  <input
                    className="mono"
                    style={{ width: "100%", marginTop: 6 }}
                    placeholder="예: 7xKX...9pQ"
                    value={theaterAddress}
                    onChange={(e) => setTheaterAddress(e.target.value)}
                    disabled={chainState === "submitting"}
                  />
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  marginTop: 14,
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="ghost"
                  onClick={connectWallet}
                  disabled={chainState === "connecting" || !!walletAddress}
                >
                  {chainState === "connecting" ? (
                    <span className="spinner" />
                  ) : (
                    <PhantomIcon />
                  )}
                  {walletAddress
                    ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)} 연결됨`
                    : chainState === "connecting"
                      ? "연결 중…"
                      : "Phantom 연결"}
                </button>
                <button
                  className="pill"
                  onClick={registerOnchain}
                  disabled={
                    !rule.ruleHash ||
                    !wallet ||
                    !theaterAddress.trim() ||
                    chainState === "submitting" ||
                    chainState === "done"
                  }
                  title={
                    !bothApproved
                      ? "양측 승인 필요"
                      : !wallet
                        ? "Phantom 지갑 연결 필요"
                        : undefined
                  }
                >
                  {chainState === "submitting" && <span className="spinner" />}
                  {chainState === "submitting"
                    ? "온체인 등록 중…"
                    : chainState === "done"
                      ? "온체인 등록 완료"
                      : "온체인 등록"}
                </button>
              </div>

              {chainError && (
                <p
                  className="chart-caption"
                  style={{ color: "var(--stamp, #BE3A28)", marginTop: 10 }}
                >
                  {chainError}
                </p>
              )}

              {chainResult && (
                <div style={{ marginTop: 14 }}>
                  <div className="label">init_escrow 트랜잭션</div>
                  <a
                    className="hash mono"
                    href={explorerTxUrl(chainResult.signature)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {chainResult.signature.slice(0, 4)}…
                    {chainResult.signature.slice(-4)} ↗ Explorer
                  </a>
                  <div className="label" style={{ marginTop: 10 }}>
                    데모용 USDC 민트 (이 등록에서 새로 생성됨)
                  </div>
                  <div className="hash-box">{chainResult.usdcMint}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
