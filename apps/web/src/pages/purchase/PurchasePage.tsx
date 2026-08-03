/**
 * STAGE 1 — 티켓 구매 웹 (관객 화면).
 * Phantom 지갑으로 직접 movie_escrow의 deposit/refund_pending을 호출한다
 * (lib/chain.ts). localnet/devnet 전환은 .env의 VITE_SOLANA_RPC_URL만
 * 바꾸면 된다 — program id는 IDL에 이미 담겨 있다.
 */
import { useState } from "react";

import { PhantomIcon } from "../../components/PhantomIcon";
import {
  DEMO_MOVIE_ID,
  depositTickets,
  describeChainError,
  explorerTxUrl,
  getPhantomProvider,
  refundPendingTickets,
  type PhantomProvider,
  type SeatTicket,
} from "../../lib/chain";
import { toUsdcSmallestUnit } from "../../lib/usdc";

const SHOWTIMES = [
  { label: "7/31 (금) 19:30", screeningId: "SCR-2026-0731-1930" },
  { label: "8/1 (토) 14:00", screeningId: "SCR-2026-0801-1400" },
  { label: "8/1 (토) 19:30", screeningId: "SCR-2026-0801-1930" },
];
const PRICE = 10;

type PayState =
  | "idle"
  | "connecting"
  | "connected"
  | "signing"
  | "paid"
  | "refunding"
  | "refunded";

function seatLabels(qty: number): string[] {
  return Array.from({ length: qty }, (_, i) => `A${i + 1}`);
}

function currentScreening(index: number) {
  const showtime = SHOWTIMES[index];
  if (!showtime) throw new Error(`invalid showtime index ${index}`);
  return showtime;
}

export function PurchasePage() {
  const [showtime, setShowtime] = useState(0);
  const [qty, setQty] = useState(1);
  const [pay, setPay] = useState<PayState>("idle");
  const [wallet, setWallet] = useState<PhantomProvider | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [seats, setSeats] = useState<string[]>([]);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [refundSignature, setRefundSignature] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const connectWallet = async () => {
    setErrorMessage(null);
    setPay("connecting");
    try {
      const provider = getPhantomProvider();
      const { publicKey } = await provider.connect();
      setWallet(provider);
      setWalletAddress(publicKey.toBase58());
      setPay("connected");
    } catch (error) {
      setErrorMessage(describeChainError(error));
      setPay("idle");
    }
  };

  const startPayment = async () => {
    if (!wallet) return;
    setErrorMessage(null);
    setPay("signing");
    try {
      const pickedSeats = seatLabels(qty);
      const tickets: SeatTicket[] = pickedSeats.map((seat) => ({
        screeningId: currentScreening(showtime).screeningId,
        seat,
        amountSmallestUnit: toUsdcSmallestUnit(PRICE),
      }));
      const signature = await depositTickets(wallet, DEMO_MOVIE_ID, tickets);
      setSeats(pickedSeats);
      setTxSignature(signature);
      setRefundSignature(null);
      setPay("paid");
    } catch (error) {
      setErrorMessage(describeChainError(error));
      setPay("connected");
    }
  };

  const requestRefund = async () => {
    if (!wallet || seats.length === 0) return;
    setErrorMessage(null);
    setPay("refunding");
    try {
      const tickets: SeatTicket[] = seats.map((seat) => ({
        screeningId: currentScreening(showtime).screeningId,
        seat,
        amountSmallestUnit: toUsdcSmallestUnit(PRICE),
      }));
      const signature = await refundPendingTickets(
        wallet,
        DEMO_MOVIE_ID,
        tickets,
      );
      setRefundSignature(signature);
      setPay("refunded");
    } catch (error) {
      setErrorMessage(describeChainError(error));
      setPay("paid");
    }
  };

  const total = qty * PRICE;

  return (
    <section className="screen">
      <p className="eyebrow">STAGE 1 — 자금 유입 · 관객 화면</p>
      <h1>티켓 예매</h1>
      <p className="sub" style={{ maxWidth: "none", whiteSpace: "nowrap" }}>
        이 결제는 중간에 아무 계좌도 거치지 않습니다.
        <br />
        결제 버튼을 누르는 순간 티켓 값은 곧장 이 영화의 전용 에스크로로 들어가,
        극장도 배급사도, 그 돈을 먼저 만질 수 없습니다.
      </p>

      <div className="grid purchase-grid">
        <div className="poster">
          <div>
            <div className="kicker">독립영화 · 상영중</div>
            <div className="title">붉은 노을 아래</div>
            <div className="meta">
              감독 Sola Na · 104분 · 인디스퀘어 시네마 1관
            </div>
          </div>
        </div>

        <div className="card">
          <div className="fieldset">
            <div>
              <div className="label">회차 선택</div>
              <div className="choices">
                {SHOWTIMES.map((s, i) => (
                  <button
                    key={s.screeningId}
                    className={`choice${i === showtime ? " on" : ""}`}
                    disabled={pay === "signing" || pay === "refunding"}
                    onClick={() => setShowtime(i)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label">인원</div>
              <span className="qty">
                <button
                  aria-label="인원 줄이기"
                  disabled={pay === "signing" || pay === "refunding"}
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                >
                  −
                </button>
                <span className="mono">{qty}</span>
                <button
                  aria-label="인원 늘리기"
                  disabled={pay === "signing" || pay === "refunding"}
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
                {total} <small>USDC</small>
              </div>
            </div>
            <p className="pay-note">
              Phantom 지갑으로 서명하면 온체인 <b>deposit</b>이 즉시 실행됩니다.
              수취 주소는 <b>“붉은 노을 아래” 에스크로 PDA</b> — 극장도 배급사도
              이 돈을 먼저 만질 수 없습니다.
            </p>
            <div className="pay-actions">
              <button
                className="ghost"
                disabled={pay === "connecting" || pay === "signing"}
                onClick={connectWallet}
              >
                {pay === "connecting" ? (
                  <span className="spinner" />
                ) : (
                  <PhantomIcon />
                )}
                {walletAddress
                  ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)} 연결됨`
                  : pay === "connecting"
                    ? "연결 중…"
                    : "Phantom 연결"}
              </button>
              <button
                className="pill"
                disabled={
                  !wallet ||
                  pay === "signing" ||
                  pay === "paid" ||
                  pay === "refunding"
                }
                onClick={startPayment}
              >
                {pay === "signing" && <span className="spinner" />}
                {pay === "signing" ? "결제 처리 중…" : "결제하기"}
              </button>
              {pay === "idle" && !walletAddress && (
                <span className="chip state-dim">지갑 미연결</span>
              )}
              {pay === "connecting" && (
                <span className="chip state-dim">지갑 연결 중…</span>
              )}
              {pay === "connected" && (
                <span className="chip state-dim">서명 대기</span>
              )}
              {pay === "signing" && (
                <span className="chip state-dim">트랜잭션 전송 중…</span>
              )}
              {(pay === "paid" ||
                pay === "refunding" ||
                pay === "refunded") && (
                <span className="chip state-live">결제 완료</span>
              )}
            </div>

            {errorMessage && (
              <p className="error-text" role="alert">
                {errorMessage}
              </p>
            )}

            {(pay === "paid" || pay === "refunding" || pay === "refunded") &&
              txSignature && (
                <div className="receipt">
                  <div className="row">
                    <span className="k">상태</span>
                    <span className="chip state-live">
                      {pay === "refunded" ? "Refunded" : "Pending — 격리됨"}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">입금 tx</span>
                    <a
                      className="hash"
                      href={explorerTxUrl(txSignature)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {txSignature.slice(0, 4)}…{txSignature.slice(-4)} ↗
                      Explorer
                    </a>
                  </div>
                  <div className="row">
                    <span className="k">좌석</span>
                    <span className="hash">
                      {currentScreening(showtime).screeningId} ·{" "}
                      {seats.join(", ")}
                    </span>
                  </div>
                  {refundSignature && (
                    <div className="row">
                      <span className="k">환불 tx</span>
                      <a
                        className="hash"
                        href={explorerTxUrl(refundSignature)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {refundSignature.slice(0, 4)}…
                        {refundSignature.slice(-4)} ↗ Explorer
                      </a>
                    </div>
                  )}
                  <hr className="hair" style={{ margin: "6px 0" }} />
                  <div className="iso-line">
                    <span className="tick">✓</span>경유 계좌 0개 — 결제 수취
                    주소가 곧 에스크로
                  </div>
                  <div className="iso-line">
                    <span className="tick">✓</span>PDA에는 개인키가 없음 —
                    누구도 임의 인출 불가
                  </div>
                  <div className="iso-line">
                    <span className="tick">✓</span>Pending 자금의 유일한 출구는
                    관객 환불
                  </div>
                  {pay !== "refunded" && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        className="ghost"
                        disabled={pay === "refunding"}
                        onClick={requestRefund}
                      >
                        {pay === "refunding" && <span className="spinner" />}
                        {pay === "refunding" ? "환불 처리 중…" : "환불 요청"}
                      </button>
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>
      </div>
    </section>
  );
}
