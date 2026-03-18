FROM node:22-bookworm-slim AS builder
WORKDIR /app

# NEXT_PUBLIC_* vars must be present at build time — they are compiled
# into the client JS bundle by Next.js and cannot be changed at runtime.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
RUN npm ci --ignore-scripts

COPY packages ./packages
COPY apps/web ./apps/web
RUN npm run build --workspace @modern-punch/core \
  && npm run build --workspace @modern-punch/web

FROM node:22-bookworm-slim AS runner
WORKDIR /
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/apps/web/.next/standalone /bundle-web
COPY --from=builder /app/apps/web/.next/static /bundle-web/apps/web/.next/static
COPY --from=builder /app/apps/web/public /bundle-web/apps/web/public

EXPOSE 3000
CMD ["node", "/bundle-web/apps/web/server.js"]
