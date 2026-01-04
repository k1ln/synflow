#!/bin/bash
# FlowSynth Quick Start Script
# One-command deployment setup

set -e

echo "🚀 FlowSynth Docker Quick Start"
echo "================================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Build and start containers
echo "🏗️  Building Docker images..."
docker compose build

echo ""
echo "🚀 Starting containers..."
docker compose up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check status
echo ""
echo "📊 Container Status:"
docker compose ps

# Health checks
echo ""
echo "🔍 Running health checks..."

if curl -f http://localhost:1337/ &> /dev/null; then
    echo "✅ Frontend is accessible"
else
    echo "⚠️  Frontend health check failed"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ FlowSynth is now running!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Access points:"
echo "   Frontend:  http://localhost:1337"
echo ""
echo "📋 Useful commands:"
echo "   View logs:     docker compose logs -f"
echo "   Stop:          docker compose down"
echo "   Restart:       docker compose restart"
echo ""
echo "📖 Docker notes: DOCKER-SETUP.md"
echo ""
