FROM node:24-alpine AS base
WORKDIR /bot

FROM base AS deps
ENV NODE_ENV=development
COPY package.json package-lock.json* ./
RUN npm install

FROM base AS builder
ENV NODE_ENV=development
COPY --from=deps /bot/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /bot/node_modules ./node_modules
COPY --from=builder /bot/dist ./dist
COPY package.json ./package.json

CMD ["node", "dist/index.js"]