"""自定义 TUI 组件."""

from textual.widgets import Static


class Logo(Static):
    """Logo 显示组件."""

    DEFAULT_CSS = """
    Logo {
        text-align: center;
        padding: 1;
        color: $primary-lighten-2;
    }
    """

    def __init__(self):
        super().__init__("🐙 SelfMe")
