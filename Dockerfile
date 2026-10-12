# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.18.1

FROM node:${NODE_VERSION}-alpine AS base

ENV NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN apk add --no-cache libc6-compat \
    && corepack enable

FROM base AS dependencies

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS builder

ARG SUNRISE_DEPLOYMENT_ID=local

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Only non-secret placeholders are needed while Next.js traces server modules.
# Runtime cloud and identity configuration is injected into the final container.
ENV SUNRISE_DASHBOARD_URL=http://localhost:9990 \
    SUNRISE_DEPLOYMENT_ID=${SUNRISE_DEPLOYMENT_ID} \
    SUNRISE_SESSION_SECRET=build-only-session-secret-change-at-runtime \
    KEYSTONE_API=http://keystone.invalid \
    KEYSTONE_PUBLIC_API=http://keystone.invalid \
    KEYSTONE_FEDERATION_IDENTITY_PROVIDERS=build \
    KEYSTONE_FEDERATION_IDENTITY_PROVIDER_PROTOCOL_BUILD=openid \
    SUNRISE_KEYCLOAK_ISSUER_BUILD=https://keycloak.invalid/realms/build \
    SUNRISE_KEYCLOAK_CLIENT_ID_BUILD=sunrise-build \
    SUNRISE_KEYCLOAK_CLIENT_SECRET_BUILD=build-only-client-secret

RUN pnpm build

FROM node:${NODE_VERSION}-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN addgroup --system --gid 1001 sunrise \
    && adduser --system --uid 1001 --ingroup sunrise --home /app sunrise

COPY --from=builder --chown=sunrise:sunrise /app/public ./public
COPY --from=builder --chown=sunrise:sunrise /app/.next/standalone ./
COPY --from=builder --chown=sunrise:sunrise /app/.next/static ./.next/static

RUN mkdir -p /app/.next/cache \
    && chown -R sunrise:sunrise /app/.next

USER sunrise

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
