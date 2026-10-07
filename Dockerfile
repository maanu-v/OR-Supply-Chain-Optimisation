# Production image for the OR supply-chain project website (Next.js + HiGHS + SQLite).
FROM node:22-bookworm-slim

# Prisma's query engine needs OpenSSL at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
# SQLite lives in /tmp so the app also works when the container runs as a non-root user
# (e.g. Hugging Face Spaces); it only stores the solve history, so losing it on restart is fine.
ENV DATABASE_URL=file:/tmp/or-scenarios.db
# Keep the V8 heap below typical 512 MB-1 GB container limits; the solver needs ~250 MB of heap.
ENV NODE_OPTIONS=--max-old-space-size=256
ENV PORT=3000
EXPOSE 3000

# Create the SQLite schema on start (cheap, idempotent), then serve on $PORT.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx next start -p ${PORT}"]
