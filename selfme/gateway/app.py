"""FastAPI application for SelfMe Gateway."""

import asyncio
import time
from datetime import datetime
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rich.console import Console

from selfme.config import settings

from .manager import SessionManager

# Console for colored logging
console = Console()


def log_info(message: str):
    """Log info message with timestamp and color."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    console.print(f"[dim]{timestamp}[/dim] [blue]ℹ️  {message}[/blue]")


def log_success(message: str):
    """Log success message with timestamp and color."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    console.print(f"[dim]{timestamp}[/dim] [green]✅ {message}[/green]")


def log_warning(message: str):
    """Log warning message with timestamp and color."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    console.print(f"[dim]{timestamp}[/dim] [yellow]🔔 {message}[/yellow]")


def log_error(message: str):
    """Log error message with timestamp and color."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    console.print(f"[dim]{timestamp}[/dim] [red]❌ {message}[/red]")


app = FastAPI(title="SelfMe Gateway", version="0.1.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in development
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

session_manager = SessionManager()

# Track active WebSocket tasks for cancellation
active_tasks: dict[str, asyncio.Task] = {}
active_cancel_flags: dict[str, bool] = {}  # Track cancellation flags for thread interruption


class CreateSessionRequest(BaseModel):
    """Request to create a new session."""

    session_id: str | None = None
    metadata: dict[str, Any] | None = None


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "version": "0.1.0",
        "active_sessions": len(session_manager.sessions),
        "model": settings.llm_model,
        "protocol": settings.llm_protocol,
    }


@app.post("/api/sessions")
async def create_session(request: CreateSessionRequest):
    """Create a new session."""
    session = session_manager.create_session(request.session_id)
    if request.metadata:
        session.metadata.update(request.metadata)

    # Log session creation with client type
    client_type = session.metadata.get("client_type", "unknown")
    if client_type == "tui":
        log_info(f"📟 TUI session created: [cyan]{session.id[:8]}[/cyan]")
    elif client_type == "web":
        log_info(f"🌐 Web session created: [cyan]{session.id[:8]}[/cyan]")
    elif client_type == "desktop":
        log_info(f"💻 Desktop session created: [cyan]{session.id[:8]}[/cyan]")
    else:
        log_info(f"Session created: [cyan]{session.id[:8]}[/cyan]")

    return {
        "session_id": session.id,
        "created_at": session.created_at.isoformat(),
    }


@app.get("/api/sessions/{session_id}")
async def get_session_info(session_id: str):
    """Get session information."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id": session.id,
        "created_at": session.created_at.isoformat(),
        "last_active": session.last_active.isoformat(),
        "message_count": len(session.memory.messages),
        "metadata": session.metadata,
    }


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a session."""
    success = session_manager.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")

    log_info(f"Session deleted: [cyan]{session_id[:8]}[/cyan]")

    return {"status": "deleted"}


@app.get("/api/sessions/{session_id}/messages")
async def get_messages(session_id: str):
    """Get session message history."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "messages": [
            {
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
                "timestamp": msg.timestamp.isoformat(),
            }
            for msg in session.memory.messages
        ]
    }


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time communication."""
    from starlette.websockets import WebSocketDisconnect

    await websocket.accept()

    # Get or create session
    session = session_manager.get_session(session_id)
    if not session:
        session = session_manager.create_session(session_id)

    try:
        while True:
            # Receive message
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "send_message":
                content = data.get("content", "").strip()
                if not content:
                    continue

                # Log message received
                preview = content[:50] + "..." if len(content) > 50 else content
                log_info(f"Message received: \"{preview}\" [dim](session: {session_id[:8]})[/dim]")

                # Send user message confirmation
                await websocket.send_json(
                    {
                        "type": "user_message",
                        "content": content,
                    }
                )

                # Add to memory
                session.memory.add("user", content)

                # Initialize cancel flag for this session
                active_cancel_flags[session_id] = False

                # Generate response (don't await - let it run in background)
                task = asyncio.create_task(generate_response(websocket, session, session_id))
                active_tasks[session_id] = task

            elif action == "cancel":
                # Cancel current generation task
                if session_id in active_tasks:
                    # Set cancel flag for thread to check
                    active_cancel_flags[session_id] = True
                    # Cancel the asyncio task
                    task = active_tasks[session_id]
                    task.cancel()
                    # Wait for task to actually finish before confirming cancellation
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass  # Expected when task is cancelled
                    except Exception:
                        pass  # Ignore other errors during cancellation

                    log_warning(f"Generation cancelled [dim](session: {session_id[:8]})[/dim]")

                    # Send cancellation confirmation after task is fully stopped
                    await websocket.send_json(
                        {
                            "type": "cancelled",
                            "content": "Generation cancelled",
                        }
                    )

            elif action == "clear":
                # Clear session
                session.memory.clear()
                await websocket.send_json(
                    {
                        "type": "cleared",
                    }
                )

    except WebSocketDisconnect:
        # Clean up task
        if session_id in active_tasks:
            # Set cancel flag for thread
            active_cancel_flags[session_id] = True
            active_tasks[session_id].cancel()
            del active_tasks[session_id]
        if session_id in active_cancel_flags:
            del active_cancel_flags[session_id]


async def generate_response(websocket: WebSocket, session, session_id: str):
    """Generate LLM response and stream to client."""
    from starlette.websockets import WebSocketState

    start_time = time.time()
    full_response = ""
    cancelled = False
    completed = False  # Track if we've sent completion/cancellation message
    token_count = 0

    # Log generation start
    log_info(f"Generating response... [dim](model: {settings.llm_model})[/dim]")

    try:
        # Get recent messages (context window)
        recent_messages = session.memory.to_llm_format()[-10:]

        # Stream generation (chat_stream is a sync generator, run in executor to avoid blocking)
        loop = asyncio.get_event_loop()

        # Create a queue for chunks
        chunk_queue = asyncio.Queue()
        generation_done = asyncio.Event()
        generation_error = None

        def generate_chunks():
            """Run sync generator in thread."""
            nonlocal generation_error
            try:
                for chunk in session.llm_client.chat_stream(recent_messages):
                    # Check if generation should be cancelled
                    if active_cancel_flags.get(session_id, False):
                        break
                    asyncio.run_coroutine_threadsafe(chunk_queue.put(chunk), loop)
            except Exception as e:
                generation_error = e
            finally:
                # Use call_soon_threadsafe for non-coroutine method
                loop.call_soon_threadsafe(generation_done.set)

        # Start generation in thread pool
        loop.run_in_executor(None, generate_chunks)

        # Process chunks
        while not generation_done.is_set():
            # Check for cancellation
            if active_cancel_flags.get(session_id, False):
                cancelled = True
                break

            try:
                # Wait for chunk with timeout to allow cancellation check
                chunk = await asyncio.wait_for(chunk_queue.get(), timeout=0.1)
                full_response += chunk
                token_count += len(chunk.split())  # Rough token estimate

                # Check if WebSocket is still connected
                if websocket.client_state != WebSocketState.CONNECTED:
                    break

                await websocket.send_json(
                    {
                        "type": "assistant_chunk",
                        "content": chunk,
                    }
                )
            except asyncio.TimeoutError:
                # No chunk yet, continue loop to check cancellation
                continue
            except asyncio.CancelledError:
                # Task was cancelled, stop immediately
                cancelled = True
                break

        # If cancelled, don't process remaining chunks or send completion
        if cancelled:
            if full_response:
                session.memory.add("assistant", full_response + " [cancelled]")
            raise asyncio.CancelledError

        # Process any remaining chunks
        while not chunk_queue.empty():
            chunk = await chunk_queue.get()
            full_response += chunk
            token_count += len(chunk.split())  # Rough token estimate

            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_json(
                    {
                        "type": "assistant_chunk",
                        "content": chunk,
                    }
                )

        # Check for generation errors
        if generation_error:
            raise generation_error

        # Check cancellation one more time before completing
        if active_cancel_flags.get(session_id, False):
            if full_response:
                session.memory.add("assistant", full_response + " [cancelled]")
            raise asyncio.CancelledError

        # Add to memory
        session.memory.add("assistant", full_response)

        # Check cancellation one final time before sending complete
        # This prevents race condition where cancel happens right before completion
        if active_cancel_flags.get(session_id, False):
            raise asyncio.CancelledError

        # Remove from active tasks BEFORE sending complete to prevent race condition
        if session_id in active_tasks:
            del active_tasks[session_id]
        if session_id in active_cancel_flags:
            del active_cancel_flags[session_id]

        # Send completion signal (only if still connected and not cancelled)
        if websocket.client_state == WebSocketState.CONNECTED and not completed:
            completed = True  # Mark as completed to prevent duplicate messages
            elapsed = time.time() - start_time

            # Log successful completion
            log_success(
                f"Response completed: [cyan]{token_count:,}[/cyan] tokens in [cyan]{elapsed:.1f}s[/cyan]"
            )

            await websocket.send_json(
                {
                    "type": "complete",
                    "metadata": {
                        "response_time": round(elapsed, 2),
                        "model": settings.llm_model,
                    },
                }
            )

    except asyncio.CancelledError:
        # Task was cancelled - already handled above
        raise

    except Exception as e:
        # Log error
        log_error(f"Generation error: {str(e)}")

        # Only try to send error if WebSocket is still connected
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.send_json(
                {
                    "type": "error",
                    "content": str(e),
                }
            )

    finally:
        # Clean up task from active_tasks (if not already cleaned up)
        if session_id in active_tasks:
            del active_tasks[session_id]
        if session_id in active_cancel_flags:
            del active_cancel_flags[session_id]


@app.on_event("startup")
async def startup_event():
    """Startup event handler."""

    async def cleanup_task():
        """Periodically clean up inactive sessions."""
        while True:
            await asyncio.sleep(300)  # Every 5 minutes
            count = session_manager.cleanup_inactive(timeout_seconds=3600)
            if count > 0:
                log_info(f"Cleaned up [cyan]{count}[/cyan] inactive sessions")

    asyncio.create_task(cleanup_task())
