ARG NODE_IMAGE=node:22.23.1-bookworm-slim

FROM ${NODE_IMAGE} AS dependencies

WORKDIR /app

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

FROM dependencies AS development

COPY . .

FROM development AS build

ARG SERVICE_PACKAGE
ENV MODELFAUCET_SERVICE_PACKAGE=${SERVICE_PACKAGE}

RUN test -n "$MODELFAUCET_SERVICE_PACKAGE"
RUN pnpm --filter "$MODELFAUCET_SERVICE_PACKAGE" build
RUN pnpm --filter "$MODELFAUCET_SERVICE_PACKAGE" deploy --prod /out \
  && rm -rf /out/.turbo /out/public /out/src /out/test /out/index.html /out/tsconfig.json

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

COPY --from=build --chown=node:node /out/ ./

USER node

EXPOSE 3201 3202 3203

CMD ["npm", "start", "--silent"]
