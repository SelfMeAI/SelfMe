"""WebSocket client for TUI to connect to Gateway."""

import asyncio
import json
from collections.abc import Callable

import httpx
import websockets


class GatewayClient:
    """WebSocket client for connecting to SelfMe Gateway."""

    def __init__(self, gateway_url: str, session_id: str | None = None):
        """Initialize the Gateway client.

        Args:
            gateway_url: Base URL of the Gateway (e.g., http://localhost:8000)
            session_id: Optional session ID. If not provided, a new session will be created.
        """
        self.gateway_url = gateway_url
        self.session_id = session_id or self._create_session_sync()
        self.ws_url = f"{gateway_url.replace('http', 'ws')}/ws/{self.session_id}"
        self.websocket: websockets.WebSocketClientProtocol | None = None
        self.receive_task: asyncio.Task | None = None

        # Callbacks for current message
        self.on_chunk: Callable[[str], None] | None = None
        self.on_complete: Callable[[dict], None] | None = None
        self.on_error: Callable[[str], None] | None = None

    def _create_session_sync(self) -> str:
        """Create a new session synchronously.

        Returns:
            The session ID.
        """
        response = httpx.post(f"{self.gateway_url}/api/sessions", json={}, timeout=10)
        response.raise_for_status()
        return response.json()["session_id"]

    async def connect(self):
        """Connect to the Gateway."""
        self.websocket = await websockets.connect(self.ws_url)
        # Start receiving messages in background
        self.receive_task = asyncio.create_task(self._receive_loop())

    async def disconnect(self):
        """Disconnect from the Gateway."""
        if self.receive_task:
            self.receive_task.cancel()
            try:
                await self.receive_task
            except asyncio.CancelledError:
                pass
        if self.websocket:
            await self.websocket.close()
            self.websocket = None

    async def _receive_loop(self):
        """Continuously receive messages from WebSocket."""
        try:
            async for message in self.websocket:
                data = json.loads(message)
                msg_type = data.get("type")

                if msg_type == "assistant_chunk" and self.on_chunk:
                    self.on_chunk(data["content"])
                elif msg_type == "complete" and self.on_complete:
                    # Save callback before clearing
                    callback = self.on_complete
                    self._clear_callbacks()
                    # Call after clearing to allow new callbacks to be set
                    callback(data.get("metadata", {}))
                elif msg_type == "error" and self.on_error:
                    # Save callback before clearing
                    callback = self.on_error
                    self._clear_callbacks()
                    # Call after clearing to allow new callbacks to be set
                    callback(data["content"])
                elif msg_type == "cancelled" and self.on_error:
                    # Save callback before clearing
                    callback = self.on_error
                    self._clear_callbacks()
                    # Call after clearing to allow new callbacks to be set
                    callback("Cancelled")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            if self.on_error:
                self.on_error(str(e))
            self._clear_callbacks()

    def _clear_callbacks(self):
        """Clear current callbacks."""
        self.on_chunk = None
        self.on_complete = None
        self.on_error = None

    async def send_message(
        self,
        content: str,
        on_chunk: Callable[[str], None],
        on_complete: Callable[[dict], None],
        on_error: Callable[[str], None],
    ):
        """Send a message and handle the response.

        Args:
            content: The message content to send.
            on_chunk: Callback for each response chunk.
            on_complete: Callback when response is complete.
            on_error: Callback for errors.
        """
        if not self.websocket:
            raise RuntimeError("Not connected to gateway")

        # Set callbacks
        self.on_chunk = on_chunk
        self.on_complete = on_complete
        self.on_error = on_error

        # Send message
        await self.websocket.send(
            json.dumps(
                {
                    "action": "send_message",
                    "content": content,
                }
            )
        )

    async def cancel_generation(self):
        """Cancel the current generation."""
        if self.websocket:
            await self.websocket.send(json.dumps({"action": "cancel"}))

    async def clear_history(self):
        """Clear the conversation history."""
        if self.websocket:
            await self.websocket.send(json.dumps({"action": "clear"}))
