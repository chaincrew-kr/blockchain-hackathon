import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/coverage/**", "**/dist/**", "**/node_modules/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // apps/web은 브라우저 환경 (Vite + React)
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // apps/web/server 등 순수 Node.js로 돌아가는 .js 백엔드 코드.
    // 위 두 블록은 .ts/.tsx만 잡아서, 플레인 .js 서버 파일은 globals가 하나도
    // 안 붙어 process/console/fetch가 no-undef로 잡히던 문제 수정.
    // 다른 팀원의 Node 서버(.js)가 늘어나면 이 files 패턴에 추가하면 됨.
    files: ["apps/web/server/**/*.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
);
