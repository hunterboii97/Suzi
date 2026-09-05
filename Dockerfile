# Production Node.js container for Suzi Discord Bot & Web Dashboard
FROM node:20-alpine

# Install dumb-init to properly handle PID 1 signals (SIGINT, SIGTERM)
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy package manifests first for optimal layer caching
COPY package*.json ./

# Install production dependencies cleanly
RUN npm ci --omit=dev

# Copy application source and assets
COPY . .

# Expose web dashboard port (Railway injects PORT dynamically, defaults to 3000)
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production

# Use dumb-init to manage process lifecycle and graceful shutdown
ENTRYPOINT ["dumb-init", "--"]

# Start both the Discord bot and Web Dashboard
CMD ["node", "src/index.js"]
