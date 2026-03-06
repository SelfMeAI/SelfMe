#!/bin/bash
# Build script for SelfMe Desktop

set -e

echo "🔨 Building SelfMe Desktop..."

# Step 1: Build Web UI
echo "📦 Building Web UI..."
cd ../web/frontend
pnpm run build
cd ../../desktop

# Step 2: Copy Web UI dist
echo "📋 Copying Web UI to desktop..."
rm -rf dist
mkdir -p dist
cp -r ../web/dist/* dist/

# Step 3: Install dependencies (if needed)
if [ ! -d "node_modules" ]; then
  echo "📥 Installing dependencies..."
  pnpm install
fi

# Step 4: Build Electron app
echo "🚀 Building Electron app..."
pnpm run build

echo "✅ Build complete! Check the build/ directory."
