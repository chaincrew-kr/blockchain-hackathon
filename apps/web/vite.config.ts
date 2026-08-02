import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // @solana/web3.js·@coral-xyz/anchor가 Node 전역(global)을 참조한다 —
  // 브라우저엔 없는 식별자라 그대로 두면 런타임에 ReferenceError로 화면이
  // 통째로 안 뜬다. Buffer 폴리필은 src/polyfills.ts에서 따로 주입한다.
  define: {
    global: "globalThis",
  },
  server: {
    port: 4020,
  },
});
