FROM oven/bun:1.2-slim AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile || bun install

# Copy source code
COPY . .

# Generate Prisma Client
RUN bunx prisma generate

EXPOSE 3000
ENV NODE_ENV=production
CMD ["bun", "run", "src/index.ts"]
