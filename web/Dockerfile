# syntax=docker/dockerfile:1

# Build the static bundle. Only the build needs Node; 22 is the current LTS.
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Optional: point "View workflow" links at a Temporal UI other than localhost:8080.
ARG VITE_TEMPORAL_UI_URL=
ENV VITE_TEMPORAL_UI_URL=${VITE_TEMPORAL_UI_URL}

COPY . .
RUN npm run build

# Serve it with nginx, which also forwards the API paths to the backend.
FROM nginx:1.29-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
