FROM node:18-alpine

# Use app directory
WORKDIR /app

# Enable corepack and prepare pnpm (works in Node 18+)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies based on lockfile for reproducible builds
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy application source
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/server.js"]
