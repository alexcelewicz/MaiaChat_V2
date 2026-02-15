# MAIAChat v2 - Deployment Guide

This guide covers deploying MAIAChat v2 to production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Docker Deployment](#docker-deployment)
4. [Manual Deployment](#manual-deployment)
5. [Coolify Deployment](#coolify-deployment)
6. [SSL/TLS Configuration](#ssltls-configuration)
7. [Database Setup](#database-setup)
8. [Monitoring & Logging](#monitoring--logging)
9. [Backup Strategy](#backup-strategy)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **CPU**: 2+ cores recommended
- **RAM**: 4GB minimum, 8GB+ recommended
- **Storage**: 20GB+ for application and data
- **OS**: Linux (Ubuntu 22.04 LTS recommended), Windows Server, or macOS

### Software Requirements

- Node.js 20+ (for manual deployment)
- Docker 24+ (for container deployment)
- PostgreSQL 16 with pgvector extension
- Redis 7+
- MinIO or S3-compatible storage

---

## Environment Variables

Create a `.env` file with the following variables:

```bash
# ============================================
# Application Settings
# ============================================
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_APP_VERSION=2.0.0

# ============================================
# Database (PostgreSQL with pgvector)
# ============================================
DATABASE_URL=postgresql://user:password@host:5432/maiachat

# ============================================
# Redis (Session & Cache)
# ============================================
REDIS_URL=redis://:password@host:6379

# ============================================
# Better Auth
# ============================================
# Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=your-32-byte-base64-encoded-secret

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# ============================================
# AI Provider API Keys (Optional - users can provide their own)
# ============================================
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIza...
XAI_API_KEY=xai-...
OPENROUTER_API_KEY=sk-or-...

# ============================================
# Encryption (for API key storage)
# ============================================
# Generate with: openssl rand -base64 32
ENCRYPTION_KEY=your-32-byte-base64-encoded-key

# ============================================
# S3/MinIO Storage
# ============================================
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=maiachat

# ============================================
# Sentry Error Tracking (Optional)
# ============================================
SENTRY_DSN=https://...@sentry.io/...
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...

# ============================================
# Domain Configuration (for Traefik)
# ============================================
DOMAIN=maiachat.com
ACME_EMAIL=admin@maiachat.com
```

---

## Docker Deployment

### Quick Start with Docker Compose

```bash
# Clone the repository
git clone https://github.com/alexcelewicz/MaiaChat_V2.git
cd maiachat_v2/maiachat-v2

# Copy environment file
cp .env.example .env
# Edit .env with your values

# Start all services
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f app
```

### Building the Docker Image

```bash
# Build with specific version
docker build -t maiachat:v2.0.0 \
  --build-arg NEXT_PUBLIC_APP_VERSION=2.0.0 \
  --build-arg NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
  .

# Push to registry (optional)
docker tag maiachat:v2.0.0 your-registry/maiachat:v2.0.0
docker push your-registry/maiachat:v2.0.0
```

### Docker Compose Services

The `docker-compose.prod.yml` includes:

| Service | Port | Description |
|---------|------|-------------|
| app | 3000 | Next.js application |
| postgres | 5432 | PostgreSQL with pgvector |
| redis | 6379 | Redis for sessions/cache |
| minio | 9000, 9001 | S3-compatible storage |
| traefik | 80, 443 | Reverse proxy (optional) |

---

## Manual Deployment

### 1. Install Dependencies

```bash
# Clone repository
git clone https://github.com/alexcelewicz/MaiaChat_V2.git
cd maiachat_v2/maiachat-v2

# Install Node.js dependencies
npm ci --production

# Build the application
npm run build
```

### 2. Database Setup

```bash
# Run migrations
npm run db:migrate

# Optional: Seed initial data
npm run db:seed
```

### 3. Start the Application

```bash
# Production start
npm run start

# Or with PM2 (recommended)
pm2 start npm --name "maiachat" -- start
pm2 save
```

### 4. Process Manager (PM2)

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'maiachat',
    script: 'npm',
    args: 'start',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

---

## Coolify Deployment

### 1. Create Project in Coolify

1. Log into your Coolify dashboard
2. Click "New Project" → "MAIAChat"
3. Select "Application" → "Docker Compose"

### 2. Connect Repository

1. Add GitHub/GitLab connection
2. Select the `maiachat_v2` repository
3. Set branch to `main`

### 3. Configure Environment

1. Go to "Environment Variables"
2. Add all variables from `.env.example`
3. Mark sensitive values as "Secret"

### 4. Configure Domain

1. Go to "Domains"
2. Add your domain (e.g., `chat.yourdomain.com`)
3. Enable "Generate SSL"

### 5. Deploy

1. Click "Deploy"
2. Monitor build logs
3. Verify health check passes

---

## SSL/TLS Configuration

### Let's Encrypt (Automatic)

With Traefik (included in docker-compose.prod.yml):

```yaml
# Traefik handles SSL automatically
labels:
  - "traefik.http.routers.maiachat.tls=true"
  - "traefik.http.routers.maiachat.tls.certresolver=letsencrypt"
```

### Custom Certificates

```yaml
# Mount certificates in docker-compose
volumes:
  - /path/to/cert.pem:/etc/ssl/cert.pem:ro
  - /path/to/key.pem:/etc/ssl/key.pem:ro
```

---

## Database Setup

### PostgreSQL with pgvector

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create database
CREATE DATABASE maiachat;
```

### Running Migrations

```bash
# Using Drizzle
npm run db:migrate

# Or directly
npx drizzle-kit migrate
```

### Database Backups

```bash
# Create backup
pg_dump -h localhost -U maiachat -d maiachat > backup_$(date +%Y%m%d).sql

# Restore backup
psql -h localhost -U maiachat -d maiachat < backup_20240101.sql
```

---

## Monitoring & Logging

### Health Check Endpoint

```bash
# Check application health
curl http://localhost:3000/api/health

# Response:
{
  "status": "healthy",
  "services": {
    "database": { "status": "up", "latency": 5 },
    "redis": { "status": "up", "latency": 2 },
    "s3": { "status": "up", "latency": 15 }
  }
}
```

### Sentry Integration

Error tracking is automatically configured when `SENTRY_DSN` is set.

### Log Aggregation

```bash
# View logs with Docker
docker compose logs -f app

# View specific service
docker compose logs -f postgres

# Tail last 100 lines
docker compose logs --tail=100 app
```

---

## Backup Strategy

### Automated Backups

```bash
#!/bin/bash
# backup.sh - Run daily via cron

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/backups/maiachat

# Database backup
pg_dump -h localhost -U maiachat maiachat | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# MinIO backup (if self-hosted)
mc mirror minio/maiachat $BACKUP_DIR/files_$DATE

# Keep last 7 days
find $BACKUP_DIR -mtime +7 -delete
```

### Restore Procedure

1. Stop the application
2. Restore database: `gunzip -c backup.sql.gz | psql maiachat`
3. Restore files: `mc mirror backup/files minio/maiachat`
4. Run migrations: `npm run db:migrate`
5. Start the application

---

## Troubleshooting

### Application Won't Start

```bash
# Check logs
docker compose logs app

# Common issues:
# - Missing environment variables
# - Database connection failed
# - Port already in use
```

### Database Connection Issues

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check pgvector
psql $DATABASE_URL -c "SELECT * FROM pg_extension WHERE extname = 'vector'"
```

### Redis Connection Issues

```bash
# Test connection
redis-cli -u $REDIS_URL PING
```

### Build Failures

```bash
# Clear cache and rebuild
docker compose build --no-cache app

# Check Node.js version
node --version  # Should be 20+
```

### Performance Issues

1. Check database indexes: `EXPLAIN ANALYZE` slow queries
2. Review Redis memory: `redis-cli INFO memory`
3. Check application memory: `docker stats`
4. Review Sentry for bottlenecks

---

## Security Checklist

- [ ] All environment variables set as secrets
- [ ] SSL/TLS enabled for all traffic
- [ ] Database password is strong (32+ characters)
- [ ] Redis password is set
- [ ] Firewall rules restrict database access
- [ ] Regular security updates applied
- [ ] Backup encryption enabled
- [ ] Rate limiting configured
- [ ] CSP headers configured

---

## Support

- **Documentation**: https://docs.maiachat.com
- **GitHub Issues**: https://github.com/alexcelewicz/MaiaChat_V2/issues
- **Email**: support@maiachat.com
