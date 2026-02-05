"""Custom TUI widgets."""

from textual.widgets import Static


class Logo(Static):
    """Logo display component."""

    DEFAULT_CSS = """
    Logo {
        text-align: center;
        padding: 1;
        color: $primary-lighten-2;
    }
    """

    def __init__(self):
        super().__init__("🐙 SelfMe")
