"""TUI 主应用."""

from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import Footer, Header, Static

from selfme.config import settings
from selfme.tui.chat import ChatContainer


class SelfMeApp(App):
    """SelfMe TUI 主应用."""

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
        ("q", "quit", "退出"),
        ("c", "clear_chat", "清空对话"),
    ]

    def compose(self) -> ComposeResult:
        """构建界面."""
        yield Header(show_clock=True)

        with Horizontal(id="main-container"):
            # 侧边栏 (后续放记忆时间线)
            with Vertical(id="sidebar"):
                yield Static(f"🐙 {settings.app_name}\nv{settings.app_version}", classes="title")
                yield Static("侧边栏\n(记忆时间线\n后续版本)", id="sidebar-content")

            # 聊天区域
            with Vertical(id="chat-area"):
                yield ChatContainer()

        yield Footer()

    def action_clear_chat(self):
        """清空对话动作."""
        chat = self.query_one(ChatContainer)
        chat.clear_chat()


def run_app():
    """启动 TUI 应用."""
    app = SelfMeApp()
    app.run()
