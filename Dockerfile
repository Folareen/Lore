# syntax=docker/dockerfile:1
FROM node:22.23.4-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@10.32.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @lore/shared build && pnpm --filter @lore/api build
RUN pnpm --filter @lore/api deploy --legacy --prod --frozen-lockfile /opt/api
ENV NEXT_TELEMETRY_DISABLED=1
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
ENV APP_ORIGIN=https://lore.afolarin.cv
RUN pnpm --filter @lore/web exec next build --webpack

FROM node:22.23.4-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /opt/api ./
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]

FROM node:22.23.4-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# Export Linux runtime files for a VPS running Node directly (no host Docker).
FROM scratch AS native
COPY --from=build /opt/api /api
COPY --from=build /app/apps/web/.next/standalone /web
COPY --from=build /app/apps/web/.next/static /web/apps/web/.next/static
COPY --from=build /app/apps/web/public /web/apps/web/public
