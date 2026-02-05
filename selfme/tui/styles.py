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

#chat-scroll {
    width: 100%;
    height: 1fr;
    border: none;
    background: transparent;
    scrollbar-size: 0 0;
    padding: 1 0 0 0;
}

#chat-log {
    padding: 1 2;
    background: transparent;
    width: 100%;
}

/* Input box - auto-height with heavy left border */
#input-box {
    width: 100%;
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

/* Status container - fixed height, bottom */
#status-container {
    height: 1;
    width: 100%;
    background: transparent;
    layout: horizontal;
    padding: 0;
    margin: 0 0 1 0;
}

/* Loading indicator in status bar */
#loading-indicator {
    width: auto;
    height: 1;
    background: transparent;
    color: #0ea5e9;
    padding: 0 1 0 2;
    margin: 0;
    content-align: left middle;
}

/* Status bar - fixed height, right-aligned, bottom */
#status-bar {
    height: 1;
    width: 1fr;
    background: transparent;
    color: #6e7681;
    content-align: right middle;
    padding: 0 2 0 0;
    margin: 0;
}

/* User message - same style as focused input box */
.user-message {
    width: 1fr;
    height: auto;
    border: none;
    border-left: heavy #0ea5e9;
    background: #0d1117;
    color: #e6edf3;
    padding: 1 2 1 2;
    margin: 0 2 1 2;
}

/* Assistant message - no background, spacing */
.assistant-message {
    width: 1fr;
    height: auto;
    border: none;
    background: transparent;
    color: white;
    padding: 1 2 1 2;
    margin: 0 2 0 2;
}

/* Clickable assistant message - add hover effect */
.assistant-message.clickable:hover {
    background: #0d1117;
}

/* Message metadata - model and time info */
.message-meta {
    width: 1fr;
    height: auto;
    border: none;
    background: transparent;
    color: #6e7681;
    padding: 0 2 0 2;
    margin: 0 2 1 2;
}
"""
