FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Security: Run as non-root user
RUN useradd -m -s /bin/bash sandbox
USER sandbox
WORKDIR /home/sandbox

# Install dependencies
COPY package.json ./
RUN npm install --production

# Copy browser control code
COPY src/ ./src/

# Expose control port
EXPOSE 9222

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD curl -f http://localhost:9222/json/version || exit 1

# Start browser with remote debugging
CMD ["node", "src/server.js"]
