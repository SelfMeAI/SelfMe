"""Simple in-memory memory store for conversations."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Message:
    """单条消息."""

    role: str  # "user" or "assistant" or "system"
    content: str
    timestamp: datetime = field(default_factory=datetime.now)
    id: str = field(default_factory=lambda: datetime.now().strftime("%Y%m%d%H%M%S%f"))


class MemoryStore:
    """内存对话存储 (v0.1 简化版)."""

    def __init__(self, max_messages: int = 100):
        self.messages: list[Message] = []
        self.max_messages = max_messages

    def add(self, role: str, content: str) -> Message:
        """添加消息."""
        msg = Message(role=role, content=content)
        self.messages.append(msg)

        # 限制消息数量，防止内存无限增长
        if len(self.messages) > self.max_messages:
            self.messages = self.messages[-self.max_messages :]

        return msg

    def get_recent(self, n: int = 10) -> list[Message]:
        """获取最近 n 条消息."""
        return self.messages[-n:]

    def to_llm_format(self, n: Optional[int] = None) -> list[dict]:
        """
        转换为 LLM API 格式.

        Args:
            n: 最近 n 条，None 表示全部
        """
        messages = self.get_recent(n) if n else self.messages
        return [{"role": m.role, "content": m.content} for m in messages]

    def clear(self):
        """清空记忆."""
        self.messages = []

    def __len__(self) -> int:
        return len(self.messages)
