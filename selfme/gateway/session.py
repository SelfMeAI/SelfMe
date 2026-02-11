"""Session management for Gateway."""

from dataclasses import dataclass, field
from datetime import datetime

from selfme.core.llm import LLMClient
from selfme.core.memory import MemoryStore


@dataclass
class Session:
    """Gateway session containing LLM client and conversation memory."""

    id: str
    memory: MemoryStore = field(default_factory=MemoryStore)
    llm_client: LLMClient = field(default_factory=lambda: LLMClient())
    created_at: datetime = field(default_factory=datetime.now)
    last_active: datetime = field(default_factory=datetime.now)
    metadata: dict = field(default_factory=dict)

    def update_activity(self):
        """Update last active timestamp."""
        self.last_active = datetime.now()
