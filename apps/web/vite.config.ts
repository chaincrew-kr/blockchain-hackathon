import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4020,
    // 대시보드가 apps/agent의 로그 API를 읽는다 (STAGE 6)
    proxy: {
      "/api": "http://localhost:4030",
    },
  },
});
