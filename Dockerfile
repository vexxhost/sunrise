# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.18.1
ARG SUNRISE_DEPLOYMENT_ID=local
ARG SUNRISE_IMAGE_SOURCE=https://github.com/vexxhost/sunrise
ARG SUNRISE_IMAGE_VERSION=0.1.0

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

ARG SUNRISE_DEPLOYMENT_ID

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

RUN --mount=type=secret,id=next_server_actions_encryption_key,required=true \
    key="$(tr -d '\r\n' </run/secrets/next_server_actions_encryption_key)" \
    && export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$key" \
    && node -e 'const value = process.env.SUNRISE_DEPLOYMENT_ID; if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) throw new Error("SUNRISE_DEPLOYMENT_ID must be a non-empty image revision containing only letters, digits, dots, underscores, or hyphens")' \
    && node -e 'const value = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY; const decoded = Buffer.from(value, "base64"); if (![16, 24, 32].includes(decoded.length) || decoded.toString("base64") !== value) throw new Error("next_server_actions_encryption_key must be canonical base64 for a 16, 24, or 32-byte key")' \
    && pnpm build

FROM node:${NODE_VERSION}-alpine AS runner

ARG SUNRISE_DEPLOYMENT_ID
ARG SUNRISE_IMAGE_SOURCE
ARG SUNRISE_IMAGE_VERSION

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    SUNRISE_DEPLOYMENT_ID=${SUNRISE_DEPLOYMENT_ID}

LABEL org.opencontainers.image.source=${SUNRISE_IMAGE_SOURCE} \
      org.opencontainers.image.version=${SUNRISE_IMAGE_VERSION} \
      org.opencontainers.image.revision=${SUNRISE_DEPLOYMENT_ID}

RUN addgroup --system --gid 1001 sunrise \
    && adduser --system --uid 1001 --ingroup sunrise --home /app sunrise \
    && printf '%s\n' "$SUNRISE_DEPLOYMENT_ID" > /app/.sunrise-build-deployment-id \
    && chmod 0444 /app/.sunrise-build-deployment-id

COPY --from=builder --chown=sunrise:sunrise /app/public ./public
COPY --from=builder --chown=sunrise:sunrise /app/.next/standalone ./
COPY --from=builder --chown=sunrise:sunrise /app/.next/static ./.next/static

RUN mkdir -p /app/.next/cache \
    && chown -R sunrise:sunrise /app/.next

USER sunrise

EXPOSE 3000

STOPSIGNAL SIGTERM

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
