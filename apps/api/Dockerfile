FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
RUN npm ci --ignore-scripts

COPY packages ./packages
COPY apps/api ./apps/api
RUN npm run build --workspace @modern-punch/core \
  && npm run prisma:generate --workspace @modern-punch/api \
  && npm run build --workspace @modern-punch/api

FROM node:22-bookworm-slim AS runner
WORKDIR /
ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/package.json /bundle/package.json
COPY --from=builder /app/package-lock.json /bundle/package-lock.json
COPY --from=builder /app/node_modules /bundle/node_modules
COPY --from=builder /app/packages /bundle/packages
COPY --from=builder /app/apps/api/package.json /bundle/apps/api/package.json
COPY --from=builder /app/apps/api/prisma /bundle/apps/api/prisma
COPY --from=builder /app/apps/api/dist /bundle/dist

EXPOSE 4000
CMD ["node", "/bundle/dist/main.js"]
