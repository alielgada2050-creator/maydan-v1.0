# Maydan — Cloud Run image (Node 22, non-root, production deps only)
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund --no-audit

FROM node:22-slim
ENV NODE_ENV=production STORE=firestore PORT=8080
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server/index.js server/store.js server/integrations.js ./server/
COPY public/index.html ./public/index.html
USER node
EXPOSE 8080
CMD ["node", "server/index.js"]
