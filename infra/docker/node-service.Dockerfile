FROM node:22-bookworm-slim

WORKDIR /app

ARG SERVICE_PACKAGE=""
ENV MODELFAUCET_SERVICE_PACKAGE=${SERVICE_PACKAGE}

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/gateway/package.json apps/gateway/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/website/package.json apps/website/package.json
COPY examples/crm-demo/package.json examples/crm-demo/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/sdk-js/package.json packages/sdk-js/package.json
COPY packages/react/package.json packages/react/package.json
COPY services/rating-worker/package.json services/rating-worker/package.json
COPY services/settlement-worker/package.json services/settlement-worker/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN if [ -n "$MODELFAUCET_SERVICE_PACKAGE" ]; then pnpm --filter "$MODELFAUCET_SERVICE_PACKAGE" build; fi

EXPOSE 3001 3002 4010 5173 5174

CMD ["sh", "-lc", "if [ -n \"$MODELFAUCET_SERVICE_PACKAGE\" ]; then pnpm --filter \"$MODELFAUCET_SERVICE_PACKAGE\" start; else pnpm dev; fi"]
