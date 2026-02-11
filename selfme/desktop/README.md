# SelfMe Desktop

Desktop application for SelfMe using Electron.

## Development

### Prerequisites

1. Build the Web UI first:
```bash
cd ../web/frontend
pnpm run build
```

2. Copy Web UI dist to desktop:
```bash
# From project root
cp -r selfme/web/dist/* selfme/desktop/dist/
```

### Install Dependencies

```bash
cd selfme/desktop
pnpm install
```

**Note:** If switching from npm to pnpm, manually delete `node_modules` first.

### Run in Development Mode

```bash
pnpm start
```

### Build for Production

```bash
# Build for current platform
pnpm run build

# Build for specific platform
pnpm run build:win    # Windows
pnpm run build:mac    # macOS
pnpm run build:linux  # Linux
```

## Configuration

Configuration file: `config.json` (in the same directory as the executable)

```json
{
  "gateway_url": "http://localhost:8000",
  "window": {
    "width": 1200,
    "height": 800
  }
}
```

### Gateway URL

- **Local**: `http://localhost:8000` - Desktop will offer to start Gateway if not running
- **Remote**: `http://your-server:8000` - Desktop will connect directly

## Directory Structure

```
desktop/
├── package.json       # Electron configuration
├── main.js           # Main process (Node.js)
├── preload.js        # Preload script
├── config.json       # Configuration file
├── dist/             # Web UI files (copied from web/dist)
│   ├── index.html
│   └── assets/
└── build/            # Build output
    └── SelfMe-*.exe/dmg/AppImage
```

## Features

- ✅ Connects to local or remote Gateway
- ✅ Auto-starts local Gateway if needed
- ✅ Portable configuration file
- ✅ Cross-platform (Windows/macOS/Linux)
- ✅ System tray support (future)
- ✅ Global shortcuts (future)
