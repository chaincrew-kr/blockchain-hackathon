/**
 * STAGE 0 — 계약 온보딩 백오피스.
 * PDF 업로드 → Gemini 추출 → 충돌 확인 → 양측 승인 → init_escrow.
 * 목업: 추출 결과·충돌·승인 상태는 mocks/demo.ts 고정 데이터.
 * 실제 연동 시 교체 지점:
 *   - 추출 결과 → Gemini Structured Output 호출 (+ 실패 시 캐시 표시)
 *   - "온체인 등록" → init_escrow(rule_hash, ver) 트랜잭션
 */
import { extractedClauses } from "../../mocks/demo";

const STEPS = [
  { n: "01", t: "계약서 업로드 ✓", s: "done" },
  { n: "02", t: "Gemini 추출 ✓", s: "done" },
  { n: "03", t: "충돌 확인 · 양측 승인", s: "now" },
  { n: "04", t: "규칙 v1 확정", s: "todo" },
  { n: "05", t: "온체인 등록 init_escrow", s: "todo" },
];

export function BackofficePage() {
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

      {/* 실제 절차이므로 번호 스텝이 정보를 담는다 */}
      <div className="steps" role="list">
        {STEPS.map((s) => (
          <div key={s.n} className={`step ${s.s}`} role="listitem">
            <div className="n">{s.n}</div>
            <div className="t">{s.t}</div>
          </div>
        ))}
      </div>

      <div className="grid">
        <div className="card">
          <h2>
            추출 결과{" "}
            <span className="muted">
              — 상영표준계약서_미광.pdf · Gemini Structured Output
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
                {extractedClauses.map((c) => (
                  <tr key={c.field} className={c.conflict ? "conflict" : ""}>
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
                        <span className="mono">{c.confidence.toFixed(2)}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="chart-caption" style={{ marginTop: 18 }}>
            충돌 1건이 열려 있습니다. 해결되기 전에는 양측 승인 버튼이
            활성화되지 않습니다 — 규칙 생성은 항상 사람의 승인 뒤에 옵니다.
          </p>
        </div>

        <div className="grid approve-grid" style={{ marginTop: 0 }}>
          <div className="card">
            <h2>
              양측 승인 <span className="muted">— 2인 승인 필수</span>
            </h2>
            <div className="party">
              <div className="who">배급 — 필름드림 배급㈜</div>
              <div className="sig">
                “제9조 정산일은 별지 2(30일) 기준으로 갈음합니다.” — 승인함
              </div>
              <span className="chip state-paid">승인 완료</span>
            </div>
            <hr className="hair" />
            <div className="party">
              <div className="who">상영 — 독립예술관</div>
              <div className="sig">추출 결과 검토 중…</div>
              <div className="act">
                <button className="pill">규칙 v1 승인</button>
                <span className="chip state-dim">대기</span>
              </div>
            </div>
          </div>
          <div className="card">
            <h2>
              온체인 등록{" "}
              <span className="muted">— init_escrow(rule_hash, ver)</span>
            </h2>
            <div className="label">규칙 해시 (SHA-256, 승인 후 확정)</div>
            <div className="hash-box">
              b7a1 90c4 e2ff 08d3 5b6e 4a17 c9d0 22ab …
            </div>
            <p className="chart-caption">
              양측 승인 완료 시 해시가 온체인에 기록됩니다. 이후 개정은{" "}
              <span className="mono" style={{ fontSize: 12 }}>
                v2
              </span>{" "}
              신규 발행으로만 가능합니다.
            </p>
            <button className="pill" disabled>
              온체인 등록
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
