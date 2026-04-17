FROM node:24-alpine AS base
WORKDIR /bot
ENV NODE_ENV=production

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install

FROM base AS builder
ENV NODE_ENV=development
COPY --from=deps /bot/node_modules ./node_modules
COPY . .
RUN chmod -R 755 /bot/node_modules/.bin || true
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /bot
ENV NODE_ENV=production

COPY --from=deps /bot/node_modules ./node_modules
COPY --from=builder /bot/dist ./dist
COPY package.json ./package.json

CMD ["node", "dist/index.js"]