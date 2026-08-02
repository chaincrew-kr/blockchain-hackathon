# syntax=docker/dockerfile:1

FROM node:22-alpine AS web-build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/agent/package.json apps/agent/
COPY apps/web/package.json apps/web/
COPY packages/ai-data/package.json packages/ai-data/
COPY packages/schema/package.json packages/schema/
COPY tools/devnet-seed/package.json tools/devnet-seed/
COPY tools/wallet/package.json tools/wallet/
RUN npm ci

COPY apps/web apps/web
COPY packages/schema packages/schema

# Vite는 VITE_* 값을 런타임이 아니라 빌드 타임에 번들에 박아넣는다 — Cloud Run
# 배포 시엔 반드시 devnet 값을 --build-arg로 넘겨야 한다 (cloudbuild.web.yaml
# 참고). 안 넘기면 apps/web/src/lib/chain.ts의 기본값(localnet,
# 127.0.0.1:8899)이 그대로 굳어서, Phantom을 설치해도 실제 결제가 실패한다.
ARG VITE_SOLANA_RPC_URL=http://127.0.0.1:8899
ARG VITE_SOLANA_CLUSTER=localnet
ARG VITE_MOVIE_ID=indie-2026-001
ENV VITE_SOLANA_RPC_URL=$VITE_SOLANA_RPC_URL
ENV VITE_SOLANA_CLUSTER=$VITE_SOLANA_CLUSTER
ENV VITE_MOVIE_ID=$VITE_MOVIE_ID

RUN npm run build --workspace=@chaincrew/web

FROM node:22-alpine AS server-deps
WORKDIR /app

# apps/web/server의 file: 의존성이 가리키는 실제 워크스페이스 경로를 먼저 만든다.
COPY packages/ai-data packages/ai-data
COPY packages/schema packages/schema
COPY apps/web/server/package.json apps/web/server/package-lock.json apps/web/server/
WORKDIR /app/apps/web/server
RUN npm ci

FROM node:22-alpine AS runtime
WORKDIR /app/apps/web/server
ENV NODE_ENV=production

COPY --from=server-deps /app/apps/web/server/node_modules ./node_modules
COPY --from=server-deps /app/packages /app/packages
COPY apps/web/server/*.js ./
COPY apps/web/server/*.json ./
COPY apps/web/server/*.txt ./
COPY --from=web-build /app/apps/web/dist /app/apps/web/dist

USER node
EXPOSE 8080
CMD ["./node_modules/.bin/tsx", "index.js"]
