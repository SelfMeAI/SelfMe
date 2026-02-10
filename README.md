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

# Run TUI version
poetry run selfme

# Run Web version
poetry run selfme-web
```

### First Time Setup (Web UI)

If you want to modify the frontend or the dist folder is missing:

```bash
cd selfme/web/frontend
pnpm install
pnpm run build
```

## Two Interfaces

### 🖥️ TUI (Terminal UI)
- Keyboard-driven interface
- Lightweight and fast
- Perfect for terminal lovers

### 🌐 Web UI
- Browser-based interface
- FastAPI + WebSocket streaming
- Easy to share and access
- Visit: http://localhost:7860

## Tech Stack

- Python 3.10+ | Textual | FastAPI | OpenAI/Anthropic API

## Features (WIP)

- [x] TUI Chat Interface
- [x] Web Chat Interface
- [x] Streaming Response
- [x] Multi-protocol Support (OpenAI/Anthropic)
- [x] Message Queue
- [x] Cancel Generation
- [ ] Persistent Memory
- [ ] Self-Evolution

---

Powered by 🦞 & 🐙
