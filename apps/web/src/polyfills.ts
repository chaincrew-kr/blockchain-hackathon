// @solana/web3.js·@coral-xyz/anchor는 Node 환경을 전제로 Buffer를 쓴다.
// 브라우저엔 없는 전역이라 앱의 다른 모듈이 로드되기 전에 여기서 주입한다.
// main.tsx 맨 위에서 가장 먼저 import해야 한다 (부수효과 전용 모듈).
import { Buffer } from "buffer";

declare global {
  interface Window {
    Buffer: typeof Buffer;
  }
}

if (!window.Buffer) {
  window.Buffer = Buffer;
}
