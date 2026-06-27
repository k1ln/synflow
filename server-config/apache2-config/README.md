# Apache2 Reverse Proxy Configuration for FlowSynth

This directory contains Apache2 configuration files to serve FlowSynth through your existing Apache2 web server with SSL/TLS certificates.

## 📁 Files

- **`synflow.org.conf`** - Apache2 VirtualHost configuration for synflow.org
- **`1ln.de.conf`** - Apache2 VirtualHost configuration for 1ln.de
- **`apache2-setup.sh`** - Automated setup script

## 🏗️ Architecture

```
Internet (HTTPS 443)
       ↓
Apache2 Web Server (with Certbot SSL)
       ↓
┌──────┴──────┐
│             │
synflow.org  1ln.de
│             │
└──────┬──────┘
       ↓
Reverse Proxy to Docker Containers
       ↓
┌──────┴───────────┐
│                  │
Backend:4000   Frontend:8080
(localhost)    (localhost)
```

## 🚀 Quick Setup

### Automated Setup (Recommended)

```bash
cd apache2-config
chmod +x apache2-setup.sh
sudo bash apache2-setup.sh
```

The script will:
1. Enable required Apache modules
2. Install configuration files
3. Enable sites
4. Test configuration
5. Optionally reload Apache

### Manual Setup

1. **Enable required Apache modules:**
   ```bash
   sudo a2enmod proxy proxy_http proxy_wstunnel rewrite ssl headers deflate
   ```

2. **Copy configuration files:**
   ```bash
   # For synflow.org
   sudo cp synflow.org.conf /etc/apache2/sites-available/
   sudo a2ensite synflow.org.conf
   
   # For 1ln.de
   sudo cp 1ln.de.conf /etc/apache2/sites-available/
   sudo a2ensite 1ln.de.conf
   ```

3. **Test configuration:**
   ```bash
   sudo apache2ctl configtest
   ```

4. **Reload Apache:**
   ```bash
   sudo systemctl reload apache2
   ```

## 🔐 SSL/TLS Certificates

### If you already have certificates (Certbot):

The configurations expect certificates at:
- `/etc/letsencrypt/live/synflow.org/`
- `/etc/letsencrypt/live/1ln.de/`

### If you need to obtain certificates:

```bash
# For synflow.org
sudo certbot --apache -d synflow.org -d www.synflow.org

# For 1ln.de
sudo certbot --apache -d 1ln.de -d www.1ln.de
```

Certbot will automatically:
- Obtain certificates
- Update Apache configuration
- Set up auto-renewal

## 🐳 Docker Configuration

The Docker containers are configured to listen only on localhost:

| Service | Port | Access |
|---------|------|--------|
| Backend | 4000 | http://127.0.0.1:4000 |
| Frontend | 8080 | http://127.0.0.1:8080 |

This ensures they're only accessible through Apache2 reverse proxy.

## 📊 Port Mapping

```
External (Internet)          Apache2              Docker
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HTTPS 443                    ↓                    
synflow.org/api/*     →    Proxy    →    127.0.0.1:4000/api/*
synflow.org/uploads/* →    Proxy    →    127.0.0.1:4000/uploads/*
synflow.org/*         →    Proxy    →    127.0.0.1:8080/*

HTTPS 443
1ln.de/api/*            →    Proxy    →    127.0.0.1:4000/api/*
1ln.de/uploads/*        →    Proxy    →    127.0.0.1:4000/uploads/*
1ln.de/*                →    Proxy    →    127.0.0.1:8080/*
```

## 🔧 Configuration Details

### Security Features

Both configurations include:
- ✅ HTTP to HTTPS redirect (all traffic encrypted)
- ✅ Security headers (X-Frame-Options, X-Content-Type-Options, etc.)
- ✅ SSL/TLS with Let's Encrypt certificates
- ✅ Localhost-only Docker bindings (not exposed to internet)
- ✅ ProxyPreserveHost for correct Host headers
- ✅ WebSocket support for real-time features

### Proxy Rules

1. **`/api/*`** → Backend API (port 4000)
2. **`/uploads/*`** → Backend uploads (port 4000)
3. **`/*`** → Frontend static files (port 8080)

### Timeouts

- **ProxyTimeout: 300 seconds** - Allows long-running operations (deployments, git pull)

### Compression

- Automatic gzip compression for text/html, CSS, JavaScript, JSON

## 🧪 Testing

### 1. Test Docker containers directly (from server)

```bash
# Backend health check
curl http://127.0.0.1:4000/api/health

# Frontend
curl http://127.0.0.1:8080/
```

### 2. Test through Apache (from anywhere)

```bash
# Backend through synflow.org
curl https://synflow.org/api/health

# Backend through 1ln.de
curl https://1ln.de/api/health

# Frontend
curl https://synflow.org/
curl https://1ln.de/
```

### 3. Test webhook endpoint

```bash
curl https://synflow.org/api/webhook/gitUpdate/health
curl https://1ln.de/api/webhook/gitUpdate/health
```

## 📝 Logging

### Apache Logs

```bash
# Access logs
sudo tail -f /var/log/apache2/synflow.org-access.log
sudo tail -f /var/log/apache2/1ln.de-access.log

# Error logs
sudo tail -f /var/log/apache2/synflow.org-error.log
sudo tail -f /var/log/apache2/1ln.de-error.log
```

### Docker Logs

```bash
# All containers
docker compose logs -f

# Backend only
docker compose logs -f backend

# Frontend only
docker compose logs -f frontend
```

## 🔄 Deployment Workflow

1. **Developer pushes to GitHub**
2. **GitHub webhook** → `https://synflow.org/api/webhook/gitUpdate`
3. **Apache2 proxies** to backend container (port 4000)
4. **Backend verifies** HMAC signature
5. **Backend triggers** deployment script
6. **Docker containers** rebuild and restart
7. **Apache2 continues** serving (zero downtime with proper rolling restart)

## 🛠️ Maintenance

### Reload Apache after config changes

```bash
# Test configuration first
sudo apache2ctl configtest

# If OK, reload
sudo systemctl reload apache2
```

### Restart Docker containers

```bash
# Graceful restart
docker compose restart

# Full rebuild
docker compose down
docker compose up -d --build
```

### Check service status

```bash
# Apache status
sudo systemctl status apache2

# Docker status
docker compose ps

# Check listening ports
sudo netstat -tlnp | grep -E '(443|4000|8080)'
```

## 🚨 Troubleshooting

### Apache shows 503 Service Unavailable

**Cause:** Docker containers not running

**Fix:**
```bash
docker compose ps
docker compose up -d
```

### Apache shows 502 Bad Gateway

**Cause:** Wrong port mapping or containers on wrong ports

**Fix:**
```bash
# Check container ports
docker compose ps

# Should show:
# backend: 127.0.0.1:4000->4000/tcp
# frontend: 127.0.0.1:8080->80/tcp
```

### SSL certificate errors

**Cause:** Certificates expired or not found

**Fix:**
```bash
# Check certificate
sudo certbot certificates

# Renew if needed
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run
```

### Webhook returns 401 Unauthorized

**Cause:** WEBHOOK_SECRET mismatch between GitHub and .env

**Fix:**
```bash
# Check your secret
grep WEBHOOK_SECRET .env

# Update in GitHub webhook settings
# Restart backend
docker compose restart backend
```

### "Connection refused" errors

**Check Docker is running:**
```bash
docker compose ps
```

**Check Apache is running:**
```bash
sudo systemctl status apache2
```

**Check firewall allows HTTPS:**
```bash
sudo ufw status
sudo ufw allow 443/tcp
```

## 🔒 Security Checklist

- ✅ Docker containers bind to 127.0.0.1 only (not 0.0.0.0)
- ✅ Apache enforces HTTPS (HTTP redirects to HTTPS)
- ✅ Security headers enabled
- ✅ `.env` file not committed to git
- ✅ Webhook uses cryptographic signature verification
- ✅ SSL/TLS certificates auto-renewed by Certbot
- ✅ Firewall allows only ports 80 and 443
- ⚠️ Consider rate limiting on webhook endpoint
- ⚠️ Monitor Apache logs for suspicious activity

## 📚 Additional Resources

- [Apache Proxy Documentation](https://httpd.apache.org/docs/2.4/mod/mod_proxy.html)
- [Certbot Documentation](https://certbot.eff.org/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [GitHub Webhooks Guide](https://docs.github.com/webhooks)

## 🆘 Quick Commands Reference

```bash
# Start everything
docker compose up -d --build
sudo systemctl start apache2

# Stop everything
docker compose down
sudo systemctl stop apache2

# View all logs
docker compose logs -f &
sudo tail -f /var/log/apache2/*-access.log &

# Restart everything
docker compose restart
sudo systemctl reload apache2

# Check everything
docker compose ps
sudo systemctl status apache2
curl https://synflow.org/api/health
curl https://1ln.de/api/health
```

---

**Need help?** Check the main deployment guide in `../README.DEPLOYMENT.md`
