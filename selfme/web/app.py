"""SelfMe Web UI using FastAPI with WebSocket streaming."""

import asyncio
import json
import time
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from selfme.config import settings
from selfme.core.llm import LLMClient
from selfme.core.memory import MemoryStore

app = FastAPI(title="SelfMe")

# Mount static files from Vue build
dist_dir = Path(__file__).parent / "dist"
if dist_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(dist_dir / "assets")), name="assets")


class SelfMeChat:
    """SelfMe chat session."""

    def __init__(self):
        """Initialize chat session."""
        self.llm = LLMClient()
        self.memory = MemoryStore()

    async def stream_response(self, message: str):
        """Stream chat response."""
        if not message.strip():
            return

        # Add user message to memory
        self.memory.add("user", message)

        # Track response time
        start_time = time.time()

        # Generate streaming response
        full_response = ""
        for chunk in self.llm.chat_stream(self.memory.to_llm_format(n=10)):
            full_response += chunk
            yield chunk
            # Small delay for smooth streaming
            await asyncio.sleep(0.01)

        # Calculate elapsed time
        elapsed_time = time.time() - start_time

        # Add metadata
        metadata = f"\n\n---\n*🐙 {settings.llm_model} · {elapsed_time:.1f}s*"
        yield metadata

        # Save assistant response to memory
        self.memory.add("assistant", full_response)


# Store active chat sessions
sessions = {}


@app.get("/api/config")
async def get_config():
    """Get app configuration."""
    return {
        "version": settings.app_version,
        "model": settings.llm_model
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for chat streaming."""
    await websocket.accept()

    # Create a new chat session for this connection
    session_id = id(websocket)
    sessions[session_id] = SelfMeChat()

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message_data = json.loads(data)
            user_message = message_data.get("message", "")

            if not user_message.strip():
                continue

            # Send user message confirmation
            await websocket.send_json({
                "type": "user_message",
                "content": user_message
            })

            # Stream response
            chat = sessions[session_id]
            async for chunk in chat.stream_response(user_message):
                await websocket.send_json({
                    "type": "assistant_chunk",
                    "content": chunk
                })

            # Send completion signal
            await websocket.send_json({
                "type": "complete"
            })

    except WebSocketDisconnect:
        # Clean up session
        if session_id in sessions:
            del sessions[session_id]


@app.get("/")
async def get_index():
    """Serve the Vue app."""
    index_file = Path(__file__).parent / "dist" / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    else:
        return {"error": "Frontend not built. Run 'cd frontend && pnpm install && pnpm run build'"}


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Serve Vue SPA for all routes."""
    file_path = Path(__file__).parent / "dist" / full_path
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path)
    else:
        # Return index.html for SPA routing
        index_file = Path(__file__).parent / "dist" / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return {"error": "Frontend not built"}


def main():
    """Launch the FastAPI web UI."""
    import uvicorn
    import sys

    # Set UTF-8 encoding for Windows
    if sys.platform == 'win32':
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

    # Beautiful startup banner
    banner = f"""
╔═════════════════════════════════════════════════════════╗
║                                                         ║
║   ███████╗███████╗██╗     ███████╗███╗   ███╗███████╗   ║
║   ██╔════╝██╔════╝██║     ██╔════╝████╗ ████║██╔════╝   ║
║   ███████╗█████╗  ██║     █████╗  ██╔████╔██║█████╗     ║
║   ╚════██║██╔══╝  ██║     ██╔══╝  ██║╚██╔╝██║██╔══╝     ║
║   ███████║███████╗███████╗██║     ██║ ╚═╝ ██║███████╗   ║
║   ╚══════╝╚══════╝╚══════╝╚═╝     ╚═╝     ╚═╝╚══════╝   ║
║                                                         ║
╚═════════════════════════════════════════════════════════╝

📦 Version    : {settings.app_version}
🧠 Model      : {settings.llm_model}
🌐 Server URL : http://localhost:7860

✨ Web UI is starting...
"""
    print(banner, flush=True)

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=7860,
        log_level="warning"  # Reduce noise
    )


if __name__ == "__main__":
    main()
