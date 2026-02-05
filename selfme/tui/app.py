"""TUI main application."""

from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import Footer, Header, Static

from selfme.config import settings
from selfme.tui.chat import ChatContainer


class SelfMeApp(App):
    """SelfMe TUI main application."""

    CSS = """
    Screen {
        align: center middle;
    }

    #main-container {
        width: 100%;
        height: 100%;
    }

    #sidebar {
        width: 25;
        height: 100%;
        background: $surface-darken-1;
        border-right: solid $primary;
    }

    #chat-area {
        width: 1fr;
        height: 100%;
    }

    .title {
        text-align: center;
        padding: 1;
        background: $primary;
        color: $text;
    }
    """

    BINDINGS = [
        ("q", "quit", "Quit"),
        ("c", "clear_chat", "Clear Chat"),
    ]

    def compose(self) -> ComposeResult:
        """Build interface."""
        yield Header(show_clock=True)

        with Horizontal(id="main-container"):
            # Sidebar (for memory timeline in future versions)
            with Vertical(id="sidebar"):
                yield Static(f"🐙 {settings.app_name}\nv{settings.app_version}", classes="title")
                yield Static("Sidebar\n(Memory timeline\ncoming in future versions)", id="sidebar-content")

            # Chat area
            with Vertical(id="chat-area"):
                yield ChatContainer()

        yield Footer()

    def action_clear_chat(self):
        """Clear chat action."""
        chat = self.query_one(ChatContainer)
        chat.clear_chat()


def run_app():
    """Launch TUI application."""
    app = SelfMeApp()
    app.run()
