"""SelfMe TUI application."""

import threading

import pyperclip
from rich.markdown import Markdown
from textual import events
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

    def action_quit(self):
        """Show goodbye message before quitting."""
        import asyncio

        # Show goodbye message in chat area
        self._add_message("👋 Goodbye!", "assistant")

        # Wait a bit then exit
        async def delayed_exit():
            await asyncio.sleep(1)
            self.exit()

        asyncio.create_task(delayed_exit())

    def __init__(self):
        super().__init__()
        self.memory = MemoryStore()
        self.llm = None
        self.has_sent_message = False  # Track if user has sent any message
        self.loading_timer = None
        self.loading_frame = 0
        self.loading_chars = [
            "▱▱▱▱▱",
            "▰▱▱▱▱",
            "▰▰▱▱▱",
            "▰▰▰▱▱",
            "▰▰▰▰▱",
            "▰▰▰▰▰",
            "▱▰▰▰▰",
            "▱▱▰▰▰",
            "▱▱▱▰▰",
            "▱▱▱▱▰",
        ]  # Block progress bar animation

    def compose(self) -> ComposeResult:
        """Build UI."""
        with Horizontal(id="header-container"):
            yield Static(self._logo_text(), id="logo-panel")
            yield Static(self._info_text(), id="info-panel")
        # Scrollable chat area - messages will be added dynamically
        yield VerticalScroll(id="chat-scroll")
        # Input box
        textarea = ChatInput(
            soft_wrap=True,
            show_line_numbers=False,
            id="input-box",
        )
        textarea.cursor_blink = False
        yield textarea
        # Status bar at bottom with loading indicator
        with Horizontal(id="status-container"):
            yield Static("", id="loading-indicator")
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
            self._add_message(f"[red]Error: {e}[/red]", "error")

        # Disable focus on all widgets except input box
        self.query_one("#logo-panel").can_focus = False
        self.query_one("#info-panel").can_focus = False
        self.query_one("#chat-scroll").can_focus = False
        self.query_one("#status-bar").can_focus = False

        # Hide loading indicator initially
        loading = self.query_one("#loading-indicator", Static)
        loading.display = False
        loading.can_focus = False

        textarea = self.query_one("#input-box", TextArea)
        textarea.focus()

    def _update_loading_animation(self):
        """Update loading animation frame."""
        loading = self.query_one("#loading-indicator", Static)
        char = self.loading_chars[self.loading_frame % len(self.loading_chars)]
        loading.update(f"[#0ea5e9]🐙 {char}[/]")
        self.loading_frame += 1

    def _start_loading(self):
        """Start loading animation."""
        loading = self.query_one("#loading-indicator", Static)
        loading.display = True
        self.loading_frame = 0
        self._update_loading_animation()
        self.loading_timer = self.set_interval(0.1, self._update_loading_animation)

    def _stop_loading(self):
        """Stop loading animation."""
        if self.loading_timer:
            self.loading_timer.stop()
            self.loading_timer = None
        loading = self.query_one("#loading-indicator", Static)
        loading.display = False

    def _add_message(self, text: str, msg_type: str = "assistant"):
        """Add a message to chat area.

        Args:
            text: Message text
            msg_type: "user", "assistant", or "error"
        """
        chat_scroll = self.query_one("#chat-scroll", VerticalScroll)

        # Create message widget with appropriate CSS class
        if msg_type == "user":
            msg_widget = Static(text, classes="user-message", markup=True)
        elif msg_type == "error":
            msg_widget = Static(text, classes="assistant-message", markup=True)
        else:  # assistant - render as Markdown and make clickable
            md = Markdown(text, code_theme="dracula")
            msg_widget = Static(md, classes="assistant-message clickable")
            # Add raw_text attribute for copying
            msg_widget.raw_text = text

        # Don't disable focus for clickable messages
        if msg_type != "assistant":
            msg_widget.can_focus = False
        chat_scroll.mount(msg_widget)

        # Auto scroll to bottom
        self.call_after_refresh(lambda: chat_scroll.scroll_end(animate=False))

    def on_text_area_changed(self, event):
        """Handle text changes."""
        # No special handling needed, just let user type naturally
        pass

    def on_chat_input_send_message(self, event: ChatInput.SendMessage):
        """Handle send message event from ChatInput."""
        self._send_message()

    def on_click(self, event: events.Click):
        """Handle click events globally."""
        # Check if clicked widget has raw_text attribute
        target = event.widget
        while target is not None:
            if hasattr(target, 'raw_text') and target.raw_text:
                try:
                    pyperclip.copy(target.raw_text)
                    self.notify("Copied to clipboard", severity="information", timeout=2)
                except Exception as e:
                    self.notify(f"Copy failed: {e}", severity="error", timeout=3)
                break
            target = target.parent

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

        # Show loading indicator
        self._start_loading()

        # Add user message
        self._add_message(f"[b]{text}[/b]", "user")
        self.memory.add("user", text)
        self.generate_response()

    def generate_response(self):
        """Generate streaming response with Markdown rendering."""
        import time

        def gen():
            try:
                start_time = time.time()

                # Create assistant message widget first
                chat_scroll = self.query_one("#chat-scroll", VerticalScroll)
                msg_widget = Static("", classes="assistant-message clickable")
                # Initialize raw_text for copying
                msg_widget.raw_text = ""

                # Mount the widget
                self.call_from_thread(chat_scroll.mount, msg_widget)

                # Stream response
                full_response = ""
                for chunk in self.llm.chat_stream(self.memory.to_llm_format(n=10)):
                    full_response += chunk
                    # Render as Markdown
                    md = Markdown(full_response, code_theme="dracula")
                    self.call_from_thread(msg_widget.update, md)
                    # Update raw_text for copying
                    msg_widget.raw_text = full_response
                    self.call_from_thread(lambda: chat_scroll.scroll_end(animate=False))

                # Calculate response time
                elapsed_time = time.time() - start_time

                # Add metadata info below the message
                meta_widget = Static(
                    f"[dim]🐙 {settings.llm_model} · {elapsed_time:.1f}s[/dim]",
                    classes="message-meta",
                    markup=True
                )
                meta_widget.can_focus = False
                self.call_from_thread(chat_scroll.mount, meta_widget)
                self.call_from_thread(lambda: chat_scroll.scroll_end(animate=False))

                # Save to memory
                self.call_from_thread(self.memory.add, "assistant", full_response)

                # Hide loading indicator when done
                self.call_from_thread(self._stop_loading)

            except Exception as e:
                self.call_from_thread(self._add_message, f"[red]Error: {e}[/]", "error")
                # Hide loading indicator on error
                self.call_from_thread(self._stop_loading)

        threading.Thread(target=gen, daemon=True).start()

    def show_response(self, text: str):
        """Show response."""
        self._add_message(text, "assistant")
        self.memory.add("assistant", text)
