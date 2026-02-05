"""SelfMe TUI application."""

import threading

from textual.app import App, ComposeResult
from textual.containers import Horizontal
from textual.widgets import RichLog, Static, TextArea

from selfme.config import settings
from selfme.core.llm import LLMClient
from selfme.core.memory import MemoryStore
from selfme.tui.styles import DEFAULT_CSS
from selfme.tui.widgets import ChatInput


class SelfMeApp(App):
    """SelfMe TUI with horizontal header."""

    CSS = DEFAULT_CSS

    BINDINGS = [
        ("ctrl+c", "quit", "Quit"),
    ]

    def __init__(self):
        super().__init__()
        self.memory = MemoryStore()
        self.llm = None
        self.has_sent_message = False  # Track if user has sent any message

    def compose(self) -> ComposeResult:
        """Build UI."""
        with Horizontal(id="header-container"):
            yield Static(self._logo_text(), id="logo-panel")
            yield Static(self._info_text(), id="info-panel")
        # RichLog with mouse wheel scrolling enabled
        yield RichLog(id="chat-log", highlight=True, wrap=True, markup=True)
        # Input box - only focusable element with placeholder
        textarea = ChatInput(
            soft_wrap=True,
            show_line_numbers=False,
            id="input-box",
        )
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

    def on_mount(self):
        """Init and focus input."""
        try:
            self.llm = LLMClient()
        except ValueError as e:
            self.query_one("#chat-log", RichLog).write(f"[red]Error: {e}[/]")

        # Disable focus on all widgets except input box
        self.query_one("#logo-panel").can_focus = False
        self.query_one("#info-panel").can_focus = False
        self.query_one("#chat-log").can_focus = False
        self.query_one("#status-bar").can_focus = False

        textarea = self.query_one("#input-box", TextArea)
        textarea.text = ""
        textarea.focus()

    def on_text_area_changed(self, event):
        """Handle text changes."""
        # No special handling needed, just let user type naturally
        pass

    def on_chat_input_send_message(self, event: ChatInput.SendMessage):
        """Handle send message event from ChatInput."""
        self._send_message()

    def _send_message(self):
        """Send message from textarea."""
        textarea = self.query_one("#input-box", TextArea)
        text = textarea.text.strip()

        if not text:
            return

        # Check for exit command
        if text.lower() == "exit":
            self.exit()
            return

        # Clear input box
        textarea.text = ""

        # Hide header on first message
        if not self.has_sent_message:
            self.has_sent_message = True
            header = self.query_one("#header-container")
            header.display = False

        self.query_one("#chat-log", RichLog).write(f"[b]{text}[/b]\n")
        self.memory.add("user", text)
        self.generate_response()

    def generate_response(self):
        """Generate response."""
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
