# syntax=docker/dockerfile:1

# 정산 에이전트(D) 컨테이너 — Cloud Run 배포용.
#
# 빌드 컨텍스트는 반드시 저장소 루트다 (npm workspaces + @chaincrew/schema 참조):
#   docker build -f apps/agent/Dockerfile -t chaincrew-agent .
#
# tsc 빌드 단계가 없다 — @chaincrew/schema의 exports가 src/index.ts를 그대로
# 가리키므로 tsx로 TypeScript를 직접 실행한다. 그래서 tsx가 루트 devDependency가
# 아니라 apps/agent의 dependency로 들어가 있어야 한다.

# ── 의존성 레이어 ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# package.json만 먼저 복사 — 소스가 바뀌어도 이 레이어는 캐시에서 재사용된다.
# workspaces 해석에 전 워크스페이스의 매니페스트가 필요해서 4개를 모두 넣는다.
COPY package.json package-lock.json ./
COPY apps/agent/package.json apps/agent/
COPY apps/web/package.json apps/web/
COPY packages/schema/package.json packages/schema/
COPY tools/wallet/package.json tools/wallet/

RUN npm ci --omit=dev

# ── 실행 레이어 ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Cloud Run이 PORT를 주입한다. 로컬 기본값은 .env.example의 AGENT_PORT와 맞춘다.
ENV PORT=4030

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/schema packages/schema
COPY apps/agent/package.json apps/agent/
COPY apps/agent/src apps/agent/src

# root로 실행하지 않는다 — node 이미지가 제공하는 비특권 사용자.
USER node

EXPOSE 4030

# Cloud Run은 자체 헬스체크를 쓰지만 로컬 `docker run` 확인용으로 둔다.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4030)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start", "--workspace=@chaincrew/agent"]
