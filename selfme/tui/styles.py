"""TUI styles and CSS definitions."""

# Default theme CSS for SelfMe TUI
DEFAULT_CSS = """
Screen {
    layout: vertical;
    background: #0a0a0f;
    padding: 0;
}

#header-container {
    height: 10;
    border: solid #0ea5e9;
    margin: 1 2 0 2;
}

#logo-panel {
    width: 20;
    height: 100%;
    padding: 1 2 1 4;
    color: #0ea5e9;
}

#info-panel {
    width: 1fr;
    height: 100%;
    padding: 1 4 1 2;
    color: #0ea5e9;
    content-align: left middle;
}

#chat-log {
    height: 1fr;
    border: none;
    padding: 1 2;
    background: transparent;
    scrollbar-background: transparent;
    scrollbar-color: #0ea5e9;
}

/* Input box - auto-height with heavy left border */
#input-box {
    height: auto;
    min-height: 3;
    max-height: 10;
    border: none;
    border-left: heavy #1e3a5f;
    background: transparent;
    color: #e6edf3;
    padding: 1 2 1 2;
    margin: 0 2 1 2;
    scrollbar-size: 0 0;
}

#input-box:focus {
    border-left: heavy #0ea5e9;
    background: #0d1117;
}

#input-box .text-area--cursor-line {
    background: transparent;
}

/* Status bar - fixed height, right-aligned, bottom */
#status-bar {
    height: 1;
    width: 100%;
    background: transparent;
    color: #6e7681;
    content-align: right middle;
    padding: 0 2;
    margin: 0;
}
"""
