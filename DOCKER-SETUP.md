# 🎯 Docker Deployment - Quick Reference

## Files Created

### Docker Configuration
- **`Dockerfile`** - Frontend multi-stage build (Vite → nginx)
- **`docker-compose.yml`** - Orchestrates the frontend service
- **`nginx.conf`** - Frontend nginx configuration (SPA routing, caching)
- **`.dockerignore`** - Root Docker ignore rules

### Deployment
No additional deployment automation scripts are required.

### Configuration & Setup
- No `.env` file is required for the frontend container.
- **`quick-start.sh`** - One-command deployment setup

### Documentation
- **`README.DEPLOYMENT.md`** - Complete deployment guide

### Updated Files


## 🚀 Quick Start (Choose One)

### Option 1: Standalone Docker (Development/Testing)
```bash
chmod +x quick-start.sh
./quick-start.sh
```
Access: `http://localhost:1337` (frontend)

### Option 2: With Apache2 Reverse Proxy (Production)
```bash
# Configure Apache2
cd apache2-config
sudo bash apache2-setup.sh

# Start Docker
cd ..
docker compose up -d --build
```
Access: `https://synflow.org` and `https://1ln.de` (via Apache2 with SSL)

See **`apache2-config/README.md`** for complete Apache2 setup.

### Option 3: Manual Steps
```bash
# 1. Build and start
docker compose up -d --build

# 2. Verify
docker compose ps
curl http://localhost:1337/
```

### Option 3: Windows PowerShell
```powershell
# 1. Build and start
docker compose up -d --build
```



## 🔍 Monitoring

```bash
# Container status
docker compose ps

# Live logs
docker compose logs -f

# Frontend only
docker compose logs -f frontend
```

## 🛑 Common Commands

```bash
# Stop all containers
docker compose down

# Restart services
docker compose restart

# Rebuild after code changes
docker compose up -d --build

# Remove everything and start fresh
docker compose down -v
docker system prune -a
docker compose up -d --build


```

## 🔒 Security Checklist

- ⚠️ Use HTTPS in production (recommended)
- ⚠️ Review firewall rules (only allow necessary ports)

## 📊 Ports

| Service | Port | Access |
|---------|------|--------|
| Frontend | 1337 | http://localhost:1337 |

## 🆘 Troubleshooting

### "Permission denied" on scripts
```bash
chmod +x quick-start.sh
```

### Containers won't start
```bash
# Check logs
docker compose logs

# Check resource usage
docker stats

# Free up space
docker system prune -a
```

## 📚 Documentation

- **Full Guide**: `README.DEPLOYMENT.md`
- **GitHub Webhooks**: https://docs.github.com/webhooks
- **Docker Compose**: https://docs.docker.com/compose/
- **Security**: https://docs.github.com/webhooks/securing

## 🎓 Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   GitHub                         │
│  (Push event + HMAC-SHA256 signature)           │
└────────────────────┬────────────────────────────┘
                     │ HTTPS POST
                     ▼
┌─────────────────────────────────────────────────┐
│              Docker Host (Server)                │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │  Frontend Container (nginx)               │  │
│  │  - Serves static files                    │  │
│  │  - SPA routing                            │  │
│  │  Port: 80                                 │  │
│  └──────────────────────────────────────────┘  │
│                     │                            │
│                     │ API requests               │
│                     ▼                            │
│  ┌──────────────────────────────────────────┐  │
│  │  Backend Container (Node.js)              │  │
│  │  - Express API                            │  │
│  │  - Webhook handler (/api/webhook/gitUpdate)│ │
│  │  - Verifies HMAC signature                │  │
│  │  - Triggers deployment                    │  │
│  │  Port: 4000                               │  │
│  └──────────────────┬───────────────────────┘  │
│                     │                            │
│                     │ Exec                       │
│                     ▼                            │
│  ┌──────────────────────────────────────────┐  │
│  │  deploy-docker.sh                         │  │
│  │  - git pull                               │  │
│  │  - docker compose rebuild                 │  │
│  │  - Restart containers                     │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
│  Volumes:                                        │
│  - backend/uploads (persistent)                  │
│  - ./ (repository, mounted read-only)           │
└─────────────────────────────────────────────────┘
```

---

**Ready to deploy?** Run `./quick-start.sh` or see `README.DEPLOYMENT.md` for details.
