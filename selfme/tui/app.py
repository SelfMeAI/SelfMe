"""SelfMe TUI application."""

import threading

from textual.app import App, ComposeResult
from textual.containers import Horizontal, VerticalScroll
from textual.widgets import Static, TextArea

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
        self.chat_content = ""  # Store all chat messages

    def compose(self) -> ComposeResult:
        """Build UI."""
        with Horizontal(id="header-container"):
            yield Static(self._logo_text(), id="logo-panel")
            yield Static(self._info_text(), id="info-panel")
        # Scrollable chat area using Static for text selection
        with VerticalScroll(id="chat-scroll"):
            yield Static("", id="chat-log", markup=True)
        # Input box
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
            self._add_message(f"[red]Error: {e}[/red]")

        # Disable focus on all widgets except input box
        self.query_one("#logo-panel").can_focus = False
        self.query_one("#info-panel").can_focus = False
        self.query_one("#chat-log").can_focus = False
        self.query_one("#chat-scroll").can_focus = False
        self.query_one("#status-bar").can_focus = False

        textarea = self.query_one("#input-box", TextArea)
        textarea.focus()

    def _add_message(self, text: str):
        """Add a message to chat log."""
        if self.chat_content:
            self.chat_content += "\n"
        self.chat_content += text
        chat_log = self.query_one("#chat-log", Static)
        chat_log.update(self.chat_content)
        # Auto scroll to bottom
        self.call_after_refresh(lambda: self.query_one("#chat-scroll", VerticalScroll).scroll_end(animate=False))

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

        self._add_message(f"[b]{text}[/b]")
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
        self._add_message(f"[#0ea5e9]{text}[/#0ea5e9]")
        self.memory.add("assistant", text)
