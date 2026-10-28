FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,target=/root/.cache npm run build
FROM build AS runtime
ENV NODE_ENV=production
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["npm","run","start"]
