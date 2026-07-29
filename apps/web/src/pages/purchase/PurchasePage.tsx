/**
 * STAGE 1 — 모의 티켓 구매 웹 (관객 화면).
 * 목업: Phantom 연결·Solana Pay 결제를 상태로 시뮬레이션한다.
 * 실제 연동 시 교체 지점:
 *   - "Phantom 연결" → @solana/wallet-adapter connect
 *   - "결제하기" → Solana Pay 트랜잭션 (수취 = 영화별 에스크로 PDA) + deposit
 */
import { useState } from "react";

const SHOWTIMES = ["7/31 (금) 19:30", "8/1 (토) 14:00", "8/1 (토) 19:30"];
const PRICE = 10;

type PayState = "idle" | "connected" | "signing" | "paid";

export function PurchasePage() {
  const [showtime, setShowtime] = useState(0);
  const [qty, setQty] = useState(1);
  const [pay, setPay] = useState<PayState>("idle");

  const startPayment = () => {
    setPay("signing");
    window.setTimeout(() => setPay("paid"), 700);
  };

  return (
    <section className="screen">
      <p className="eyebrow">
        <span className="chip-role">담당 A</span> STAGE 1 — 자금 유입 · 관객
        화면
      </p>
      <h1>티켓 예매</h1>
      <p className="sub">
        결제 수취 주소가 곧 영화별 에스크로 PDA입니다. 경유 계좌 없이, 결제
        순간부터 정산 규칙이 자금을 격리합니다.
      </p>

      <div className="grid purchase-grid">
        <div className="poster">
          <div>
            <div className="kicker">독립영화 · 상영중</div>
            <div className="title">미광 微光</div>
            <div className="meta">감독 김도영 · 87분 · 독립예술관 1관</div>
          </div>
        </div>

        <div className="card">
          <div className="fieldset">
            <div>
              <div className="label">회차 선택</div>
              <div className="choices">
                {SHOWTIMES.map((s, i) => (
                  <button
                    key={s}
                    className={`choice${i === showtime ? " on" : ""}`}
                    onClick={() => setShowtime(i)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label">인원</div>
              <span className="qty">
                <button
                  aria-label="인원 줄이기"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                >
                  −
                </button>
                <span className="mono">{qty}</span>
                <button
                  aria-label="인원 늘리기"
                  onClick={() => setQty((q) => Math.min(8, q + 1))}
                >
                  +
                </button>
              </span>
            </div>
            <hr className="hair" />
            <div className="total-row">
              <div className="label" style={{ margin: 0 }}>
                결제 금액
              </div>
              <div className="amount">
                {qty * PRICE} <small>USDC</small>
              </div>
            </div>
            <p className="pay-note">
              Phantom 지갑으로 서명하면 <b>Solana Pay</b>로 즉시 결제됩니다.
              수취 주소는 <b>《미광》 에스크로 PDA</b> — 극장도 배급사도 이 돈을
              먼저 만질 수 없습니다.
            </p>
            <div className="pay-actions">
              <button
                className="ghost"
                onClick={() => setPay((p) => (p === "idle" ? "connected" : p))}
              >
                {pay === "idle" ? "Phantom 연결" : "Gx4f…9kQe 연결됨"}
              </button>
              <button
                className="pill"
                disabled={pay !== "connected"}
                onClick={startPayment}
              >
                결제하기
              </button>
              {pay === "idle" && (
                <span className="chip state-dim">지갑 미연결</span>
              )}
              {pay === "connected" && (
                <span className="chip state-dim">서명 대기</span>
              )}
              {pay === "signing" && (
                <span className="chip state-dim">Solana Pay 전송 중…</span>
              )}
              {pay === "paid" && (
                <span className="chip state-live">
                  결제 완료 · ~0.4s 최종성
                </span>
              )}
            </div>

            {pay === "paid" && (
              <div className="receipt">
                <div className="row">
                  <span className="k">상태</span>
                  <span className="chip state-live">Pending — 격리됨</span>
                </div>
                <div className="row">
                  <span className="k">입금 tx</span>
                  <a
                    className="hash"
                    href="https://explorer.solana.com/?cluster=devnet"
                    target="_blank"
                    rel="noreferrer"
                  >
                    5Kd2…vXq9 ↗ Explorer
                  </a>
                </div>
                <div className="row">
                  <span className="k">수취 (에스크로 PDA)</span>
                  <span className="hash">Esc7…miGw</span>
                </div>
                <hr className="hair" style={{ margin: "6px 0" }} />
                <div className="iso-line">
                  <span className="tick">✓</span>경유 계좌 0개 — 결제 수취
                  주소가 곧 에스크로
                </div>
                <div className="iso-line">
                  <span className="tick">✓</span>PDA에는 개인키가 없음 — 누구도
                  임의 인출 불가
                </div>
                <div className="iso-line">
                  <span className="tick">✓</span>Pending 자금의 유일한 출구는
                  관객 환불
                </div>
                <div style={{ marginTop: 8 }}>
                  <button className="ghost">환불 요청</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
