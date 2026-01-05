#!/bin/bash
# Apache2 Configuration Setup Script for FlowSynth
# This script helps configure Apache2 as a reverse proxy for Docker containers

set -e

echo "🌐 FlowSynth Apache2 Configuration Setup"
echo "========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  This script requires sudo privileges"
    echo "Please run: sudo bash apache2-setup.sh"
    exit 1
fi

# Check if Apache2 is installed
if ! command -v apache2 &> /dev/null; then
    echo "❌ Apache2 is not installed"
    echo "Install with: sudo apt-get install apache2"
    exit 1
fi

echo "✅ Apache2 is installed"

# Enable required Apache modules
echo ""
echo "📦 Enabling required Apache2 modules..."
a2enmod proxy
a2enmod proxy_http
a2enmod proxy_wstunnel
a2enmod rewrite
a2enmod ssl
a2enmod headers
a2enmod deflate

echo "✅ Required modules enabled"

# Ask which domain to configure
echo ""
echo "Which domain would you like to configure?"
echo "1) synflow.org"
echo "2) 1ln.de"
echo "3) Both"
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        DOMAINS=("synflow.org")
        ;;
    2)
        DOMAINS=("1ln.de")
        ;;
    3)
        DOMAINS=("synflow.org" "1ln.de")
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

# Copy configuration files
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APACHE_CONF_DIR="/etc/apache2/sites-available"

for domain in "${DOMAINS[@]}"; do
    echo ""
    echo "📝 Configuring ${domain}..."
    
    SOURCE="${SCRIPT_DIR}/${domain}.conf"
    DEST="${APACHE_CONF_DIR}/${domain}.conf"
    
    if [ ! -f "$SOURCE" ]; then
        echo "❌ Configuration file not found: $SOURCE"
        continue
    fi
    
    # Backup existing config if present
    if [ -f "$DEST" ]; then
        echo "   Backing up existing configuration..."
        cp "$DEST" "${DEST}.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    # Copy new configuration
    cp "$SOURCE" "$DEST"
    echo "   ✅ Copied configuration to ${DEST}"
    
    # Enable site
    a2ensite "${domain}.conf"
    echo "   ✅ Enabled site ${domain}"
    
    # Check if SSL certificate exists
    if [ ! -d "/etc/letsencrypt/live/${domain}" ]; then
        echo "   ⚠️  SSL certificate not found for ${domain}"
        echo "   Run: sudo certbot --apache -d ${domain} -d www.${domain}"
    else
        echo "   ✅ SSL certificate found"
    fi
done

# Test Apache configuration
echo ""
echo "🔍 Testing Apache configuration..."
if apache2ctl configtest; then
    echo "✅ Configuration test passed"
else
    echo "❌ Configuration test failed"
    echo "Please check the error messages above"
    exit 1
fi

# Ask to reload Apache
echo ""
read -p "Reload Apache2 to apply changes? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    systemctl reload apache2
    echo "✅ Apache2 reloaded"
else
    echo "⚠️  Remember to reload Apache2 manually: sudo systemctl reload apache2"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Configuration Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Start Docker containers:"
echo "   docker compose up -d --build"
echo ""
echo "2. Verify containers are running:"
echo "   docker compose ps"
echo ""
echo "3. Check Apache proxy is working:"
for domain in "${DOMAINS[@]}"; do
    echo "   curl https://${domain}/api/health"
done
echo ""
echo "4. View Apache logs if needed:"
for domain in "${DOMAINS[@]}"; do
    echo "   sudo tail -f /var/log/apache2/${domain}-access.log"
    echo "   sudo tail -f /var/log/apache2/${domain}-error.log"
done
echo ""
echo "🔐 GitHub Webhook Configuration:"
for domain in "${DOMAINS[@]}"; do
    echo "   Payload URL: https://${domain}/api/webhook/gitUpdate"
done
echo "   Content type: application/json"
echo "   Secret: Use WEBHOOK_SECRET from your .env file"
echo ""

# Check if Docker containers are running
if command -v docker &> /dev/null; then
    echo "🐳 Docker container status:"
    docker compose ps 2>/dev/null || echo "   Docker containers not running yet"
fi

echo ""
echo "📚 Documentation: README.DEPLOYMENT.md"
echo ""
