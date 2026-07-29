/**
 * [담당: A] 화면 셸 — 3개 화면(S1 예매 · S0 백오피스 · S6 대시보드) 전환.
 * 지금은 탭 상태로 전환하는 목업. 라우터 도입 시 pages/ 그대로 라우트로 승격.
 */
import { useState } from "react";

import { BackofficePage } from "./pages/backoffice/BackofficePage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { PurchasePage } from "./pages/purchase/PurchasePage";

const SCREENS = [
  { id: "s1", stage: "S1", label: "예매", page: <PurchasePage /> },
  { id: "s0", stage: "S0", label: "백오피스", page: <BackofficePage /> },
  { id: "s6", stage: "S6", label: "대시보드", page: <DashboardPage /> },
] as const;

type ScreenId = (typeof SCREENS)[number]["id"];

export function App() {
  const [screen, setScreen] = useState<ScreenId>("s1");
  const current = SCREENS.find((s) => s.id === screen) ?? SCREENS[0];

  return (
    <>
      <header>
        <div className="topbar">
          <div className="wordmark">
            Movie Escrow<small>영화 정산 에이전트</small>
          </div>
          <span className="nav-dot" aria-hidden="true" />
          <span className="net">DEVNET · DEMO · UI v0.1</span>
          <nav aria-label="화면 전환">
            {SCREENS.map((s) => (
              <button
                key={s.id}
                className={`tab${s.id === screen ? " on" : ""}`}
                onClick={() => {
                  setScreen(s.id);
                  window.scrollTo({ top: 0 });
                }}
              >
                <b>{s.stage}</b> {s.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {current.page}

      <footer>
        <span>UI v0.1 — PLAN-INDIE-003 화면 S1 · S0 · S6</span>
        <span>
          디자인 시스템: docs/DESIGN (1).md — void black · dusk violet
        </span>
      </footer>
    </>
  );
}
