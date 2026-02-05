"""Minimal TUI with horizontal header layout."""

import sys
from threading import Thread

from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import RichLog, Static, TextArea
from textual.message import Message

from selfme.config import settings
from selfme.core.llm import LLMClient
from selfme.core.memory import MemoryStore


class ChatInput(TextArea):
    """Custom TextArea that sends message on Enter."""

    class SendMessage(Message):
        """Message sent when user presses Enter."""

        pass

    async def _on_key(self, event) -> None:
        """Override key handling to intercept Enter."""
        # Check for Ctrl+Enter (multiple key combinations for cross-platform support)
        # Windows: ctrl+j, Unix: ctrl+m, or generic ctrl+enter
        is_ctrl_enter = (
            event.key == "ctrl+j" or
            event.key == "ctrl+m" or
            event.key == "ctrl+enter"
        )

        if is_ctrl_enter:
            # Insert newline at cursor position
            self.insert("\n")
            event.prevent_default()
            event.stop()
            return

        # Check for plain Enter (send message)
        if event.key == "enter":
            # Prevent TextArea from inserting newline
            event.prevent_default()
            event.stop()
            # Send message
            self.post_message(self.SendMessage())
            return

        # Let other keys be processed normally
        await super()._on_key(event)


class SelfMeApp(App):
    """SelfMe TUI with horizontal header."""

    CSS = """
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
        padding: 1 2;
        color: #0ea5e9;
    }

    #info-panel {
        width: 1fr;
        height: 100%;
        padding: 1;
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

    /* Placeholder styles */
    #input-box.is-empty {
        color: #6e7681;
        text-style: italic;
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

    BINDINGS = [
        ("ctrl+c", "quit", "Quit"),
    ]

    def __init__(self):
        super().__init__()
        self.memory = MemoryStore()
        self.llm = None

    def compose(self) -> ComposeResult:
        """Build UI."""
        with Horizontal(id="header-container"):
            yield Static(self._logo_text(), id="logo-panel")
            yield Static(self._info_text(), id="info-panel")
        yield RichLog(id="chat-log", highlight=True, wrap=True, markup=True)
        # Input box
        textarea = ChatInput(soft_wrap=True, show_line_numbers=False, id="input-box")
        textarea.cursor_blink = False
        yield textarea
        # Status bar at bottom
        yield Static(self._status_text(), id="status-bar")

    def _logo_text(self) -> str:
        """Create logo text."""
        return """  [#0ea5e9]████████[/#0ea5e9]
 [#0ea5e9]██████████[/]
 [#0ea5e9]██[/]  ░░  [#0ea5e9]██[/]
  [#0ea5e9]████████[/#0ea5e9]
 [#0ea5e9]██[/]  [#0ea5e9]██[/]  [#0ea5e9]██[/]
[#0ea5e9]█ ██[/]    [#0ea5e9]██ █[/]
[#0ea5e9]█ ██[/]    [#0ea5e9]██ █[/]"""

    def _info_text(self) -> str:
        """Create info text."""
        return f"""[#0ea5e9]SelfMe[/] v{settings.app_version}

[dim]Model:[/dim]     [#0ea5e9]{settings.llm_model}[/]
[dim]Protocol:[/dim]  [#0ea5e9]{settings.llm_protocol}[/]

[dim]Welcome back![/dim]"""

    def _status_text(self) -> str:
        return "[b]Ctrl+Enter[/b] New Line │ [b]Ctrl+C[/b] Quit"

    def update_status(self):
        """Update status bar."""
        self.query_one("#status-bar", Static).update(self._status_text())

    def on_mount(self):
        """Init and focus input."""
        try:
            self.llm = LLMClient()
        except ValueError as e:
            self.query_one("#chat-log", RichLog).write(f"[red]Error: {e}[/]")

        textarea = self.query_one("#input-box", TextArea)
        textarea.text = "Type message and press Enter"
        textarea.add_class("is-empty")
        textarea.focus()

    def on_text_area_changed(self, event):
        """Handle text changes."""
        textarea = event.text_area
        current_text = textarea.text

        if textarea.has_class("is-empty"):
            if current_text != "Type message and press Enter":
                textarea.remove_class("is-empty")
                # Extract user input
                user_text = current_text.replace("Type message and press Enter", "")
                textarea.text = user_text
                # Move cursor to end
                if user_text:
                    lines = user_text.split("\n")
                    textarea.cursor_location = (len(lines) - 1, len(lines[-1]))
        else:
            if not current_text.strip():
                textarea.text = "Type message and press Enter"
                textarea.add_class("is-empty")

    def on_chat_input_send_message(self, event: ChatInput.SendMessage):
        """Handle send message event from ChatInput."""
        self._send_message()

    def _send_message(self):
        """Send message from textarea."""
        textarea = self.query_one("#input-box", TextArea)

        # Skip if placeholder
        if textarea.has_class("is-empty"):
            return

        text = textarea.text.strip()
        if not text:
            return

        # Clear and reset placeholder
        textarea.text = "Type message and press Enter"
        textarea.add_class("is-empty")

        if text == "c":
            self.memory.clear()
            self.query_one("#chat-log", RichLog).clear()
            self.query_one("#chat-log", RichLog).write("[dim]Chat cleared[/dim]")
            self.update_status()
            return

        if text == "?":
            self.query_one("#chat-log", RichLog).write(
                "[dim]Commands: c=clear, ?=help, Ctrl+C=quit, Enter=send, Ctrl+Enter=newline[/dim]"
            )
            return

        self.query_one("#chat-log", RichLog).write(f"[b]{text}[/b]\n")
        self.memory.add("user", text)
        self.update_status()
        self.generate_response()

    def generate_response(self):
        """Generate response."""
        import threading

        def gen():
            try:
                response = self.llm.chat(self.memory.to_llm_format(n=10))
                self.call_from_thread(self.show_response, response)
            except Exception as e:
                self.call_from_thread(self.show_response, f"[red]Error: {e}[/]")

        threading.Thread(target=gen, daemon=True).start()

    def show_response(self, text: str):
        """Show response."""
        self.query_one("#chat-log", RichLog).write(f"[#0ea5e9]{text}[/#0ea5e9]\n")
        self.memory.add("assistant", text)
        self.update_status()


def run_app():
    """Launch."""
    SelfMeApp().run(mouse=False)


def main():
    """Main entry function."""
    try:
        run_app()
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
