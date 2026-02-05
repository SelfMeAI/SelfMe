"""Chat interface components."""

from threading import Thread

from textual.containers import Vertical
from textual.message import Message
from textual.widgets import Input, RichLog

from selfme.config import settings
from selfme.core.llm import LLMClient
from selfme.core.memory import MemoryStore


class TokenMessage(Message):
    """Streaming token message."""
    
    def __init__(self, token: str, is_done: bool = False) -> None:
        self.token = token
        self.is_done = is_done
        super().__init__()


class ChatContainer(Vertical):
    """Chat container component."""

    DEFAULT_CSS = """
    ChatContainer {
        height: 100%;
    }

    #chat-history {
        height: 1fr;
        border: solid $primary-darken-2;
        padding: 1;
        background: $surface-darken-2;
    }

    #chat-input {
        height: 3;
        margin: 0;
    }

    #chat-input:focus {
        border: tall $primary;
    }
    """

    def __init__(self):
        super().__init__()
        self.memory = MemoryStore()
        self.llm = None
        self.is_generating = False
        self.current_response = ""

    def compose(self):
        """Build components."""
        yield RichLog(id="chat-history", highlight=True, wrap=True)
        yield Input(placeholder="Type message and press Enter...", id="chat-input")

    def on_mount(self):
        """Initialize on component mount."""
        try:
            self.llm = LLMClient()
            self.add_system_message(
                f"🦞 Welcome back!\n"
                f"🐙 SelfMe v{settings.app_version} is ready\n"
                f"[dim]Model: {self.llm.model}[/dim]"
            )
        except ValueError as e:
            self.add_system_message(f"⚠️ Initialization failed: {e}\nPlease check LLM_API_KEY in .env file")

    def on_input_submitted(self, event: Input.Submitted):
        """Handle input submission."""
        if not event.value.strip() or self.is_generating:
            return

        user_message = event.value.strip()
        input_widget = self.query_one("#chat-input", Input)
        input_widget.value = ""

        self.add_user_message(user_message)
        self.start_generation(user_message)

    def add_user_message(self, content: str):
        """Add user message to display."""
        history = self.query_one("#chat-history", RichLog)
        history.write(f"[b]You:[/b] {content}")
        self.memory.add("user", content)

    def add_system_message(self, content: str):
        """Add system message."""
        history = self.query_one("#chat-history", RichLog)
        history.write(f"[dim]{content}[/dim]")

    def start_generation(self, user_message: str):
        """Start generating response."""
        if not self.llm:
            return

        self.is_generating = True
        self.current_response = ""

        messages = self.memory.to_llm_format(n=10)

        # Run LLM streaming in background thread
        def generate_in_thread():
            try:
                for token in self.llm.chat_stream(messages):
                    self.post_message(TokenMessage(token))
                self.post_message(TokenMessage("", is_done=True))
            except Exception as e:
                self.post_message(TokenMessage(f"[Error: {e}]", is_done=True))

        thread = Thread(target=generate_in_thread, daemon=True)
        thread.start()

    def on_token_message(self, message: TokenMessage):
        """Handle streaming token."""
        history = self.query_one("#chat-history", RichLog)

        if message.is_done:
            # Complete, save to memory
            self.memory.add("assistant", self.current_response)
            self.is_generating = False
            self.current_response = ""
        else:
            # Append token and refresh display
            self.current_response += message.token
            
            # Batch update: every 3 tokens or punctuation
            if len(self.current_response) % 3 == 0 or message.token in ".!?，。！？":
                self.refresh_chat_display(history)

    def refresh_chat_display(self, history: RichLog):
        """Refresh chat display (including streaming response)."""
        # Clear and rewrite all content
        history.clear()
        
        # Write historical messages
        for msg in self.memory.messages:
            if msg.role == "user":
                history.write(f"[b]You:[/b] {msg.content}")
            elif msg.role == "assistant":
                history.write(f"[b]🐙:[/b] {msg.content}")
        
        # Write generating response
        if self.is_generating:
            history.write(f"[b]🐙:[/b] {self.current_response}")

    def clear_chat(self):
        """Clear chat."""
        self.memory.clear()
        history = self.query_one("#chat-history", RichLog)
        history.clear()
        self.add_system_message("🗑️ Chat cleared")
