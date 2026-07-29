FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/agent/package.json packages/agent/package.json
RUN npm ci

COPY config/tsconfig.base.json config/tsconfig.base.json
COPY apps/api apps/api

EXPOSE 4021

CMD ["npm", "run", "start", "--workspace=@chaincrew/api"]
