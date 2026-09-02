FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci \
  --workspace=@raspi5-control-center/shared \
  --workspace=@raspi5-control-center/web \
  --include-workspace-root=false

COPY packages/shared packages/shared
COPY apps/web apps/web

RUN npm run build --workspace=@raspi5-control-center/shared \
  && npm run build --workspace=@raspi5-control-center/web

FROM nginx:1.29.8-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 5173

HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=4 \
  CMD wget --quiet --spider http://127.0.0.1:5173/health || exit 1
