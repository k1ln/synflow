# 🎯 Apache2 + Docker Quick Reference

## One-Time Setup

```bash
# 1. Generate secrets
./generate-secrets.sh

# 2. Configure Apache2
cd apache2-config
sudo bash apache2-setup.sh

# 3. Start Docker
docker compose up -d --build

# 4. Verify
curl https://flowsynth.org/api/health
curl https://1ln.de/api/health
```

## Daily Commands

```bash
# View logs
docker compose logs -f
sudo tail -f /var/log/apache2/flowsynth.org-access.log

# Restart services
docker compose restart
sudo systemctl reload apache2

# Check status
docker compose ps
sudo systemctl status apache2
```

## Ports

| Service | Port | Bind | Access |
|---------|------|------|--------|
| Apache2 | 443 | 0.0.0.0 | Public (HTTPS) |
| Apache2 | 80 | 0.0.0.0 | Redirect to HTTPS |
| Backend | 4000 | 127.0.0.1 | Via Apache only |
| Frontend | 8080 | 127.0.0.1 | Via Apache only |

## Webhook URLs

- `https://synflow.org/api/webhook/gitUpdate`
- `https://1ln.de/api/webhook/gitUpdate`

Use `WEBHOOK_SECRET` from `.env` file in GitHub settings.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| 503 Error | `docker compose up -d` |
| 502 Error | Check `docker compose ps` |
| SSL Error | `sudo certbot renew` |
| Webhook 401 | Check WEBHOOK_SECRET matches |

## File Locations

```
apache2-config/
├── synflow.org.conf    # Apache config for synflow.org
├── 1ln.de.conf          # Apache config for 1ln.de
├── apache2-setup.sh     # Setup script
└── README.md            # Full documentation

docker-compose.yml        # Container config (ports: 4000, 8080)
.env                      # Secrets (never commit!)
deploy-docker.sh         # Auto-deployment script
```

## Documentation

- **Apache2 Setup:** `apache2-config/README.md`
- **Full Deployment:** `README.DEPLOYMENT.md`
- **Architecture:** `ARCHITECTURE-APACHE2.md`
- **Quick Start:** `DOCKER-SETUP.md`
