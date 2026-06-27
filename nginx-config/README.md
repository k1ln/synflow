# Nginx Reverse Proxy Setup for FlowSynth

This guide replaces the existing Apache-based reverse proxy on the host with Nginx while keeping the Docker topology intact (frontend on `127.0.0.1:8080`, backend on `127.0.0.1:4000`).

## 1. Prerequisites

- Ubuntu/Debian host with root or sudo privileges
- Existing Docker deployment running the FlowSynth containers
- DNS records for `synflow.org` (and `www.synflow.org`) pointing to the host IP
- Certbot installed (`sudo apt-get install certbot python3-certbot-nginx`)

## 2. Install and Prepare Nginx

### Ubuntu/Debian

```bash
sudo apt-get update
sudo apt-get install nginx
sudo systemctl enable nginx
```

### Arch Linux

```bash
sudo pacman -Syu nginx
sudo systemctl enable --now nginx
```

If Apache is still installed, disable it so port 80/443 are freed:

```bash
sudo systemctl stop apache2
sudo systemctl disable apache2
```

## 3. Create ACME Challenge Directory

```bash
sudo mkdir -p /var/www/letsencrypt
sudo chown -R www-data:www-data /var/www/letsencrypt
```

## 4. Deploy the Site Configuration

1. Copy `synflow.org.conf` from this repository into `/etc/nginx/sites-available/`:

   ```bash
   sudo cp nginx-config/synflow.org.conf /etc/nginx/sites-available/synflow.org.conf
   ```

2. Enable the site and remove the default server block:

   ```bash
   sudo rm /etc/nginx/sites-enabled/default
   sudo ln -s /etc/nginx/sites-available/synflow.org.conf /etc/nginx/sites-enabled/
   ```

3. Test the configuration:

   ```bash
   sudo nginx -t
   ```

4. Reload Nginx:

   ```bash
   sudo systemctl reload nginx
   ```

At this point HTTP requests are redirected to HTTPS, but certificates still need to be issued or copied over.

## 5. Obtain/Install TLS Certificates

If you already have valid certificates in `/etc/letsencrypt/live/synflow.org/`, make sure ownership is correct (`root:root`) and proceed to the next step. Otherwise run Certbot with the Nginx plugin:

### Ubuntu/Debian

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d synflow.org -d www.synflow.org
```

### Arch Linux

```bash
sudo pacman -S certbot certbot-nginx
sudo certbot --nginx -d synflow.org -d www.synflow.org
```

Certbot automatically injects the `ssl_certificate` directives defined in `synflow.org.conf` and reloads Nginx. You can adjust the renewal timer afterwards:

```bash
sudo systemctl list-timers | grep certbot
```

## 6. Verify the Proxy Chain

```bash
curl -I http://127.0.0.1:8080/
curl -I http://127.0.0.1:4000/api/health
curl -I https://synflow.org/
```

If the proxied endpoints return 502/504, ensure the Docker containers are bound to `127.0.0.1` and running (`docker compose ps`).

## 7. Logs & Maintenance

- Access log: `/var/log/nginx/synflow.org.access.log`
- Error log: `/var/log/nginx/synflow.org.error.log`
- Reload after configuration changes: `sudo systemctl reload nginx`

To watch logs live:

```bash
sudo tail -f /var/log/nginx/synflow.org.error.log
```

## 8. Optional: HTTP Strict Transport Security

The provided configuration enables HSTS for one year. If you need to disable it temporarily, remove or comment the `Strict-Transport-Security` header and reload Nginx.

## 9. Rollback

To revert to Apache, disable the Nginx site, re-enable Apache, and reload services.

```bash
sudo systemctl stop nginx
sudo systemctl disable nginx
sudo systemctl enable apache2
sudo systemctl start apache2
```

---
Reference configuration: `nginx-config/synflow.org.conf`
