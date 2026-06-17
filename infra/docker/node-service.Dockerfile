FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/gateway/package.json apps/gateway/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY examples/crm-demo/package.json examples/crm-demo/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/sdk-js/package.json packages/sdk-js/package.json
COPY packages/react/package.json packages/react/package.json
COPY services/rating-worker/package.json services/rating-worker/package.json
COPY services/settlement-worker/package.json services/settlement-worker/package.json

RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 3001 3002 4010 5173 5174

CMD ["pnpm", "dev"]

