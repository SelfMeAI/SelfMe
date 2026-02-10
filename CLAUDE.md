# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SelfMe is a personal AI agent with a chat interface built using Textual (TUI framework). It supports multiple LLM protocols (OpenAI and Anthropic) through a unified client abstraction.

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
# Run the TUI application
poetry run selfme

# Run the Web UI application
poetry run selfme-web

# Alternative entry points
poetry run python -m selfme
python selfme/cli.py  # Direct execution
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
- **ALWAYS** run `pnpm run build` after modifying any frontend code
- Build artifacts in `selfme/web/dist/` are **NOT** git-ignored and **MUST** be committed
- **ALWAYS** clean up temporary/backup files (e.g., `*_old.vue`, `*_new.vue`, `*_backup.*`) after use

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

- **Textual**: TUI framework
- **Rich**: Text formatting (used by Textual)
- **OpenAI SDK**: For OpenAI-compatible APIs
- **Anthropic SDK**: For Claude API (optional, only if using anthropic protocol)
- **pydantic + pydantic-settings**: Configuration management
- **python-dotenv**: Environment variable loading
- **httpx**: HTTP client (dependency of OpenAI/Anthropic SDKs)

## File Organization Guidelines

- `cli.py`: Keep minimal - only entry point logic
- `core/`: Business logic that doesn't depend on UI
- `tui/`: All Textual-related UI code
- Never import `tui` modules from `core` modules (maintain separation of concerns)

## Known Limitations

1. No persistent memory - conversations lost on restart
2. Fixed context window (last 10 messages sent to LLM in `app.py:generate_response()`)
3. No streaming display in UI - waits for complete response
4. Anthropic protocol hardcodes `max_tokens=4096` in `core/llm.py`
5. Single-threaded message processing (no concurrent requests)
