# SelfMe

> Your AI Self - A personal embodied AI agent

🚧 **Early Development** - Work in progress

## Quick Start

```bash
# Install
poetry install

# Configure
cp .env.example .env
# Edit .env and add your LLM_API_KEY

# Show help
poetry run selfme

# Run TUI
poetry run selfme tui

# Run Web UI
poetry run selfme web
```

### First Time Setup (Web UI)

If you want to modify the frontend or the dist folder is missing:

```bash
cd selfme/web/frontend
pnpm install
pnpm run build
```

## Architecture

SelfMe uses a Gateway architecture:
- **Gateway**: Central server handling all LLM interactions
- **TUI Client**: Terminal interface connecting to Gateway
- **Web Client**: Browser interface connecting to Gateway

The Gateway auto-starts when you run TUI or Web UI, so you don't need to manage it manually.

## Commands

```bash
# Show help
poetry run selfme

# Start TUI (auto-starts Gateway)
poetry run selfme tui

# Start Web UI (auto-starts Gateway)
poetry run selfme web

# Start Gateway only
poetry run selfme gateway

# Advanced options
poetry run selfme tui --no-auto                    # Don't auto-start Gateway
poetry run selfme tui --gateway-url http://remote:8000  # Connect to remote Gateway
poetry run selfme gateway --port 8000              # Custom Gateway port
poetry run selfme web --web-port 8080              # Custom Web UI port
```

## Two Interfaces

### 🖥️ TUI (Terminal UI)
- Keyboard-driven interface
- Lightweight and fast
- Perfect for terminal lovers
- Auto-starts Gateway

### 🌐 Web UI
- Browser-based interface
- Real-time WebSocket streaming
- Easy to share and access
- Visit: http://localhost:8080
- Auto-starts Gateway

## Tech Stack

- Python 3.10+ | Textual | FastAPI | WebSocket | OpenAI/Anthropic API
- Frontend: Vue 3 + Vite

## Features (WIP)

- [x] Gateway Architecture
- [x] TUI Chat Interface
- [x] Web Chat Interface
- [x] Streaming Response
- [x] Multi-protocol Support (OpenAI/Anthropic)
- [x] Message Queue
- [x] Cancel Generation
- [x] Auto-start Gateway
- [x] Multi-client Support
- [ ] Persistent Memory
- [ ] Self-Evolution

---

Powered by 🦞 & 🐙
