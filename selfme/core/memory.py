"""Simple in-memory memory store for conversations."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Message:
    """Single message."""

    role: str  # "user", "assistant", or "system"
    content: str
    timestamp: datetime = field(default_factory=datetime.now)
    id: str = field(default_factory=lambda: datetime.now().strftime("%Y%m%d%H%M%S%f"))


class MemoryStore:
    """In-memory conversation storage (v0.1 simplified version)."""

    def __init__(self, max_messages: int = 100):
        self.messages: list[Message] = []
        self.max_messages = max_messages

    def add(self, role: str, content: str) -> Message:
        """Add message."""
        msg = Message(role=role, content=content)
        self.messages.append(msg)

        # Limit message count to prevent unbounded memory growth
        if len(self.messages) > self.max_messages:
            self.messages = self.messages[-self.max_messages :]

        return msg

    def get_recent(self, n: int = 10) -> list[Message]:
        """Get recent n messages."""
        return self.messages[-n:]

    def to_llm_format(self, n: Optional[int] = None) -> list[dict]:
        """
        Convert to LLM API format.

        Args:
            n: Recent n messages, None for all
        """
        messages = self.get_recent(n) if n else self.messages
        return [{"role": m.role, "content": m.content} for m in messages]

    def clear(self):
        """Clear memory."""
        self.messages = []

    def __len__(self) -> int:
        return len(self.messages)
