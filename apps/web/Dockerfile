FROM node:20-alpine AS base
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.12.2 --activate

# Build with repo root as context:
# docker build -f poe-platform/apps/web/Dockerfile poe-platform
FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --no-frozen-lockfile

FROM deps AS builder
RUN pnpm --filter web build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /workspace /workspace
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]
