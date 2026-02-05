"""Custom TUI widgets."""

from textual.message import Message
from textual.widgets import TextArea


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
