# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Generate Prisma client (uses @prisma/adapter-pg — no Rust engine binary needed)
RUN npx prisma generate

COPY tsconfig.json .
COPY src ./src
RUN npm run build

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

# Copy compiled output + all node_modules (includes prisma CLI for migrate deploy)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production
EXPOSE 3001

# Run migrations then start the server
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/index.js"]
