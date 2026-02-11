"""SelfMe TUI application."""

import asyncio

import pyperclip
from rich.markdown import Markdown
from textual import events
from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.widgets import Static, TextArea

from selfme.config import settings
from selfme.tui.client import GatewayClient
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
        # Show goodbye message in chat area
        self._add_message("👋 Goodbye!", "assistant")

        # Wait a bit then exit
        async def delayed_exit():
            await asyncio.sleep(1)
            if self.client:
                await self.client.disconnect()
            self.exit()

        asyncio.create_task(delayed_exit())

    def __init__(self, gateway_url: str = "http://localhost:8000"):
        super().__init__()
        self.gateway_url = gateway_url
        self.client: GatewayClient | None = None
        self.has_sent_message = False
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
        ]
        self.is_generating = False
        self.cancel_generation = False
        self.message_queue = []
        self.current_response = ""
        self.current_msg_widget = None

    def compose(self) -> ComposeResult:
        """Build UI."""
        with Vertical(id="header-container"):
            with Horizontal(id="logo-row"):
                yield Static(self._logo_text(), id="logo-panel")
                yield Static(self._version_text(), id="version-panel")
            yield Static(self._model_text(), id="model-panel")
            yield Static(self._welcome_text(), id="welcome-panel")
        yield VerticalScroll(id="chat-scroll")
        yield VerticalScroll(id="queue-container")
        textarea = ChatInput(
            soft_wrap=True,
            show_line_numbers=False,
            id="input-box",
        )
        textarea.cursor_blink = False
        yield textarea
        with Horizontal(id="status-container"):
            yield Static("", id="loading-indicator")
            yield Static(self._status_text(), id="status-bar")

    def _logo_text(self) -> str:
        """Create logo text."""
        return """[#0ea5e9]  ███████╗███████╗██╗     ███████╗███╗   ███╗███████╗
  ██╔════╝██╔════╝██║     ██╔════╝████╗ ████║██╔════╝
  ███████╗█████╗  ██║     █████╗  ██╔████╔██║█████╗
  ╚════██║██╔══╝  ██║     ██╔══╝  ██║╚██╔╝██║██╔══╝
  ███████║███████╗███████╗██║     ██║ ╚═╝ ██║███████╗
  ╚══════╝╚══════╝╚══════╝╚═╝     ╚═╝     ╚═╝╚══════╝[/]"""

    def _version_text(self) -> str:
        """Create version text."""
        return f"[#8b949e]v{settings.app_version}[/]"

    def _model_text(self) -> str:
        """Create model info text."""
        return f"[dim]Model[/dim] [#0ea5e9]{settings.llm_model}[/]"

    def _welcome_text(self) -> str:
        """Create welcome text."""
        return "[bold #0ea5e9]✨ Welcome back![/]"

    def _status_text(self) -> str:
        return "[b]Ctrl+Enter[/b] New Line │ [b]Esc[/b] Cancel │ [b]Ctrl+C[/b] Quit"

    async def on_mount(self):
        """Init and focus input."""
        try:
            self.client = GatewayClient(self.gateway_url)
            await self.client.connect()
        except Exception as e:
            self._add_message(f"[red]Error connecting to gateway: {e}[/red]", "error")

        # Disable focus on all widgets except input box
        self.query_one("#logo-panel").can_focus = False
        self.query_one("#version-panel").can_focus = False
        self.query_one("#model-panel").can_focus = False
        self.query_one("#welcome-panel").can_focus = False
        self.query_one("#chat-scroll").can_focus = False
        self.query_one("#queue-container").can_focus = False
        self.query_one("#status-bar").can_focus = False

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
        self.is_generating = True
        self.cancel_generation = False
        self._update_loading_animation()
        self.loading_timer = self.set_interval(0.1, self._update_loading_animation)

    def _stop_loading(self):
        """Stop loading animation."""
        if self.loading_timer:
            self.loading_timer.stop()
            self.loading_timer = None
        loading = self.query_one("#loading-indicator", Static)
        loading.display = False
        self.is_generating = False
        self.cancel_generation = False

    def _add_message(self, text: str, msg_type: str = "assistant"):
        """Add a message to chat area."""
        chat_scroll = self.query_one("#chat-scroll", VerticalScroll)

        if msg_type == "user":
            msg_widget = Static(text, classes="user-message", markup=True)
        elif msg_type == "error":
            msg_widget = Static(text, classes="assistant-message", markup=True)
        else:
            md = Markdown(text, code_theme="dracula")
            msg_widget = Static(md, classes="assistant-message clickable")
            msg_widget.raw_text = text

        if msg_type != "assistant":
            msg_widget.can_focus = False
        chat_scroll.mount(msg_widget)

        self.call_after_refresh(lambda: chat_scroll.scroll_end(animate=False))

    def on_key(self, event: events.Key):
        """Handle key press events."""
        if event.key == "escape" and self.is_generating:
            self.cancel_generation = True
            asyncio.create_task(self._cancel_generation())

    def on_chat_input_send_message(self, event: ChatInput.SendMessage):
        """Handle send message event from ChatInput."""
        self._send_message()

    def on_click(self, event: events.Click):
        """Handle click events globally."""
        target = event.widget
        while target is not None:
            if hasattr(target, "raw_text") and target.raw_text:
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

        if text.lower() == "exit":
            self.action_quit()
            return

        textarea.text = ""

        if not self.has_sent_message:
            self.has_sent_message = True
            header = self.query_one("#header-container")
            header.display = False

        if self.is_generating:
            self.message_queue.append(text)
            self._update_queue_display()
            return

        self._start_loading()
        self._add_message(f"[b]{text}[/b]", "user")
        asyncio.create_task(self._send_to_gateway(text))

    def _update_queue_display(self):
        """Update the queue display."""
        queue_container = self.query_one("#queue-container", VerticalScroll)
        queue_container.remove_children()

        if self.message_queue:
            queue_container.display = True
            header = Static(
                f"[dim]📋 Queued ({len(self.message_queue)}):[/dim]", classes="queued-message"
            )
            header.can_focus = False
            queue_container.mount(header)

            next_msg = self.message_queue[0]
            msg_widget = Static(f"[dim]▸[/dim] {next_msg}", classes="queued-message")
            msg_widget.can_focus = False
            queue_container.mount(msg_widget)
        else:
            queue_container.display = False

    def _process_next_message(self):
        """Process the next message in the queue."""
        if self.message_queue:
            text = self.message_queue.pop(0)
            self._update_queue_display()
            self._start_loading()
            self._add_message(f"[b]{text}[/b]", "user")
            asyncio.create_task(self._send_to_gateway(text))

    async def _send_to_gateway(self, content: str):
        """Send message to gateway and handle response."""
        if not self.client:
            self._add_message("[red]Not connected to gateway[/red]", "error")
            self._stop_loading()
            return

        # Create message widget for streaming
        chat_scroll = self.query_one("#chat-scroll", VerticalScroll)
        self.current_msg_widget = Static("", classes="assistant-message clickable")
        self.current_msg_widget.raw_text = ""
        chat_scroll.mount(self.current_msg_widget)
        self.current_response = ""

        def on_chunk(chunk: str):
            """Handle response chunk."""
            self.current_response += chunk
            md = Markdown(self.current_response, code_theme="dracula")
            self.current_msg_widget.update(md)
            self.current_msg_widget.raw_text = self.current_response
            chat_scroll.scroll_end(animate=False)

        def on_complete(metadata: dict):
            """Handle completion."""
            # Add metadata
            meta_widget = Static(
                f"[dim]🐙 {settings.llm_model} · {metadata.get('response_time', 0)}s[/dim]",
                classes="message-meta",
                markup=True,
            )
            meta_widget.can_focus = False
            chat_scroll.mount(meta_widget)
            chat_scroll.scroll_end(animate=False)

            self._stop_loading()
            self._process_next_message()

        def on_error(error: str):
            """Handle error."""
            if error == "Cancelled":
                cancel_widget = Static(
                    "[dim italic]🚫 Cancelled[/dim italic]",
                    classes="message-meta",
                    markup=True,
                )
                cancel_widget.can_focus = False
                chat_scroll.mount(cancel_widget)
                chat_scroll.scroll_end(animate=False)
            else:
                self._add_message(f"[red]Error: {error}[/red]", "error")

            self._stop_loading()
            self._process_next_message()

        try:
            await self.client.send_message(content, on_chunk, on_complete, on_error)
        except Exception as e:
            on_error(str(e))

    async def _cancel_generation(self):
        """Cancel current generation."""
        if self.client:
            await self.client.cancel_generation()
