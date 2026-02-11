# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SelfMe is a personal AI agent with a Gateway architecture. It supports multiple LLM protocols (OpenAI and Anthropic) through a unified client abstraction. The Gateway handles all LLM interactions, while TUI, Web UI, and Desktop clients connect to the Gateway via WebSocket.

## Development Commands

### Setup
```bash
# Install dependencies
poetry install

# Configure environment
cp .env.example .env
# Edit .env and set: LLM_PROTOCOL, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
```

### Running the Application
```bash
# Show help
poetry run selfme

# Run TUI (auto-starts Gateway)
poetry run selfme tui

# Run Web UI (auto-starts Gateway)
poetry run selfme web

# Run Gateway only
poetry run selfme gateway

# Advanced options
poetry run selfme tui --no-auto                    # Don't auto-start Gateway
poetry run selfme tui --gateway-url http://remote:8000  # Connect to remote Gateway
poetry run selfme gateway --port 8000              # Custom port
poetry run selfme web --web-port 8080              # Custom Web UI port
```

### Frontend Development (Web UI)
```bash
# Navigate to frontend directory
cd selfme/web/frontend

# Install dependencies (first time only)
pnpm install

# Development mode with hot reload
pnpm run dev

# Build for production (REQUIRED after any frontend changes)
pnpm run build
```

**CRITICAL: Frontend Build Rules**
- **ALWAYS** use `pnpm` for all frontend dependencies (Web UI and Desktop)
- **ALWAYS** run `pnpm run build` after modifying any frontend code
- Build artifacts in `selfme/web/dist/` are **NOT** git-ignored and **MUST** be committed
- **Desktop app**: After modifying frontend, MUST copy to desktop: `cp -r selfme/web/dist/* selfme/desktop/dist/`
- **ALWAYS** clean up temporary/backup files (e.g., `*_old.vue`, `*_new.vue`, `*_backup.*`) after use

### Desktop Development
```bash
# Navigate to desktop directory
cd selfme/desktop

# Install dependencies (first time only)
pnpm install

# Development mode
pnpm start

# Build for production
pnpm run build              # Build for current platform
pnpm run build:win          # Build for Windows
pnpm run build:mac          # Build for macOS
pnpm run build:linux        # Build for Linux
```

**Desktop Build Process:**
1. Build Web UI: `cd selfme/web/frontend && pnpm run build`
2. Copy to desktop: `cp -r selfme/web/dist/* selfme/desktop/dist/`
3. Build desktop app: User builds manually (network-intensive, not automated)

**IMPORTANT: After ANY frontend modification:**
- MUST rebuild Web UI: `pnpm run build`
- MUST copy to desktop: `cp -r selfme/web/dist/* selfme/desktop/dist/`
- Desktop packaging is done manually by user (use `build.sh` or `build.bat`)

### Code Quality
```bash
# Run linter (checks code style)
poetry run ruff check .

# Auto-fix linting issues
poetry run ruff check --fix .

# Format code
poetry run ruff format .
```

### Testing
```bash
# Run tests
poetry run pytest

# Run specific test file
poetry run pytest tests/test_file.py

# Run with verbose output
poetry run pytest -v
```

### Development Mode
```bash
# Run Textual dev console (for TUI debugging)
poetry run textual console

# In another terminal, run the app with console enabled
poetry run textual run --dev selfme.cli:main
```

## Architecture

### Directory Structure

```
selfme/
├─��� cli.py              # Entry point (26 lines) - main() and run_app()
├── config.py           # Configuration management with pydantic-settings
├── core/               # Business logic
│   ├── llm.py          # LLM client abstraction (136 lines)
│   └── memory.py       # Conversation memory store (54 lines)
└── tui/                # Terminal UI components
    ├── __init__.py     # Exports SelfMeApp and ChatInput
    ├── app.py          # Main application class (229 lines)
    └── widgets.py      # Custom widgets like ChatInput (42 lines)
```

### Core Components

1. **LLM Client Abstraction** (`selfme/core/llm.py`)
   - `LLMClient`: Unified interface supporting OpenAI and Anthropic protocols
   - Protocol selection via `settings.llm_protocol` ("openai" or "anthropic")
   - Both protocols support streaming via `chat_stream()` and non-streaming via `chat()`
   - Message format conversion handled internally for Anthropic (extracts system messages)
   - Protocol-specific clients initialized lazily based on config

2. **Memory Management** (`selfme/core/memory.py`)
   - `MemoryStore`: Simple in-memory conversation storage
   - Auto-limits to `max_messages` (default 100) to prevent unbounded growth
   - Provides `to_llm_format()` for API-compatible message lists
   - Note: Currently no persistent storage - conversations are ephemeral

3. **Configuration** (`selfme/config.py`)
   - Uses `pydantic-settings` for typed configuration
   - Loads from `.env` file via `python-dotenv`
   - Global `settings` instance imported throughout codebase
   - Creates `~/.selfme` data directory on initialization

4. **TUI Application** (`selfme/tui/app.py`)
   - Textual-based terminal UI with custom styling
   - All UI layout and event handling in `SelfMeApp` class
   - Imports CSS from `styles.py`
   - Threading model: LLM calls run in background thread, results posted back via `call_from_thread()`
   - Built-in commands: `c` (clear chat), `?` (help)
   - Status bar shows keyboard shortcuts at bottom

5. **Styles** (`selfme/tui/styles.py`)
   - `DEFAULT_CSS`: Main theme definition
   - Centralized CSS for easy theme customization
   - Can be extended with multiple themes in the future

6. **Custom Widgets** (`selfme/tui/widgets.py`)
   - `ChatInput`: Custom TextArea widget that sends on Enter, newline on Ctrl+Enter
   - Emits `SendMessage` event when user presses Enter
   - Cross-platform key handling for Windows/Unix

7. **CLI Entry Point** (`selfme/cli.py`)
   - Minimal entry point - only 26 lines
   - `main()`: Exception handling and graceful exit
   - `run_app()`: Instantiates and runs `SelfMeApp`

### Protocol Support Details

**OpenAI Protocol:**
- Direct message format pass-through
- Streaming via `client.chat.completions.create(stream=True)`
- Extracts content from `chunk.choices[0].delta.content`

**Anthropic Protocol:**
- System messages extracted and passed as `system` parameter
- Regular messages converted to `{role, content}` format
- Fixed `max_tokens=4096` in requests
- Streaming via `client.messages.create(stream=True)`
- Extracts content from `chunk.delta.text` when `chunk.type == "content_block_delta"`

### Entry Point Flow

1. `poetry run selfme` → `selfme.cli:main()` (defined in pyproject.toml)
2. `main()` → `run_app()` → `SelfMeApp().run()`
3. `SelfMeApp` (from `selfme.tui`) instantiates `LLMClient` and `MemoryStore`
4. User input via `ChatInput` widget ��� `_send_message()` → `generate_response()` (threaded) → `show_response()`

## Code Style

- Configured via `pyproject.toml` [tool.ruff] section
- Line length: 100 characters
- Target: Python 3.10+
- Style checks: E (pycodestyle errors), F (pyflakes), I (isort), N (naming), W (warnings), UP (pyupgrade), B (bugbear), C4 (comprehensions), SIM (simplify)
- Docstring convention: Google style
- E501 (line too long) is ignored - relies on formatter

## Important Patterns

1. **Adding New LLM Protocols**:
   - Edit `selfme/core/llm.py`
   - Add new protocol check in `LLMClient.__init__()`
   - Implement `_init_<protocol>()` and `_chat_<protocol>()` methods
   - Ensure `_chat_<protocol>()` returns Iterator[str] for streaming
   - Update `.env.example` with example configuration

2. **Modifying Memory**:
   - Edit `selfme/core/memory.py`
   - Keep `Message` dataclass simple - add fields as needed
   - `MemoryStore` should remain stateless (no file I/O in base class)
   - Implement persistence as separate subclass if needed

3. **UI Changes**:
   - Edit `selfme/tui/app.py` for main application logic
   - Edit `selfme/tui/styles.py` for CSS and themes
   - Edit `selfme/tui/widgets.py` for custom widget behavior
   - CSS styles centralized in `DEFAULT_CSS` constant
   - Use Textual's reactive system sparingly - current implementation uses manual updates
   - Thread-safe updates via `call_from_thread()` for background operations

4. **Adding New Themes**:
   - Create new CSS constant in `selfme/tui/styles.py` (e.g., `LIGHT_CSS`)
   - Can switch themes by changing `SelfMeApp.CSS` assignment in `app.py`
   - Future: Add theme switcher in settings

4. **Adding New Widgets**:
   - Create widget class in `selfme/tui/widgets.py`
   - Import in `selfme/tui/__init__.py` for easy access
   - Use in `SelfMeApp.compose()` method in `app.py`

4. **Configuration**:
   - Edit `selfme/config.py` for new settings
   - Never commit `.env` file
   - All new config should be added to both `Settings` class and `.env.example`
   - Use Pydantic validators for complex config validation

## Dependencies

**Python (Backend):**
- **Textual**: TUI framework
- **Rich**: Text formatting (used by Textual)
- **FastAPI**: Web framework for Gateway and Web UI
- **Uvicorn**: ASGI server
- **WebSockets**: WebSocket support
- **OpenAI SDK**: For OpenAI-compatible APIs
- **Anthropic SDK**: For Claude API (optional, only if using anthropic protocol)
- **pydantic + pydantic-settings**: Configuration management
- **python-dotenv**: Environment variable loading
- **httpx**: HTTP client (dependency of OpenAI/Anthropic SDKs)

**Frontend (Web UI & Desktop):**
- **Vue.js 3**: Frontend framework
- **Vite**: Build tool
- **Marked**: Markdown rendering
- **Highlight.js**: Code syntax highlighting

**Desktop:**
- **Electron**: Desktop application framework
- **electron-builder**: Build and packaging tool

## File Organization Guidelines

- `cli.py`: Entry point for CLI commands (tui, web, gateway)
- `core/`: Business logic that doesn't depend on UI
- `gateway/`: Gateway server (FastAPI + WebSocket)
- `tui/`: Terminal UI (Textual)
- `web/`: Web UI (FastAPI + Vue.js)
- `desktop/`: Desktop application (Electron + Web UI)
- Never import `tui` or `web` modules from `core` modules (maintain separation of concerns)

## Desktop Application

The desktop application is built with Electron and uses the same Web UI as the browser version.

**Key Features:**
- Portable configuration file (`config.json` in app directory)
- Auto-starts local Gateway if configured URL is localhost
- Connects to remote Gateway if configured
- Cross-platform (Windows/macOS/Linux)

**Configuration (`config.json`):**
```json
{
  "gateway_url": "http://localhost:8000",
  "window": {
    "width": 1200,
    "height": 800
  }
}
```

**Build Process:**
1. Build Web UI: `cd selfme/web/frontend && pnpm run build`
2. Copy to desktop: `cp -r selfme/web/dist/* selfme/desktop/dist/`
3. Build desktop app: `cd selfme/desktop && npm run build`

**Development:**
- Run in dev mode: `cd selfme/desktop && npm start`
- Requires Gateway to be running separately

## Known Limitations

1. No persistent memory - conversations lost on restart
2. Fixed context window (last 10 messages sent to LLM in `app.py:generate_response()`)
3. No streaming display in UI - waits for complete response
4. Anthropic protocol hardcodes `max_tokens=4096` in `core/llm.py`
5. Single-threaded message processing (no concurrent requests)
