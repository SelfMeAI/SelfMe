"""Session manager for Gateway."""

import uuid
from datetime import datetime
from typing import Dict, Optional

from .session import Session


class SessionManager:
    """Manages Gateway sessions."""

    def __init__(self):
        self.sessions: Dict[str, Session] = {}

    def create_session(self, session_id: Optional[str] = None) -> Session:
        """Create a new session.

        Args:
            session_id: Optional session ID. If not provided, a UUID will be generated.

        Returns:
            The created session.
        """
        if session_id is None:
            session_id = str(uuid.uuid4())

        session = Session(id=session_id)
        self.sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        """Get a session by ID.

        Args:
            session_id: The session ID.

        Returns:
            The session if found, None otherwise.
        """
        session = self.sessions.get(session_id)
        if session:
            session.update_activity()
        return session

    def delete_session(self, session_id: str) -> bool:
        """Delete a session.

        Args:
            session_id: The session ID.

        Returns:
            True if the session was deleted, False if not found.
        """
        if session_id in self.sessions:
            del self.sessions[session_id]
            return True
        return False

    def cleanup_inactive(self, timeout_seconds: int = 3600) -> int:
        """Clean up inactive sessions.

        Args:
            timeout_seconds: Sessions inactive for longer than this will be deleted.

        Returns:
            Number of sessions deleted.
        """
        now = datetime.now()
        to_delete = [
            sid
            for sid, session in self.sessions.items()
            if (now - session.last_active).total_seconds() > timeout_seconds
        ]
        for sid in to_delete:
            del self.sessions[sid]
        return len(to_delete)
