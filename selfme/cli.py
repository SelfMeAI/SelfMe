"""CLI entry point for SelfMe."""

import argparse
import subprocess
import sys
import time

import httpx


def show_help():
    """Show help message."""
    from selfme.config import settings

    help_text = f"""
SelfMe v{settings.app_version}

Usage:
  selfme              Show this help message
  selfme tui          Start TUI (Terminal Interface)
  selfme web          Start Web UI (Browser Interface)
  selfme gateway      Start Gateway server

Commands:
  tui                 Terminal interface (auto-starts gateway if needed)
  web                 Web browser interface (auto-starts gateway if needed)
  gateway             Gateway server only (runs in foreground)

Options:
  -h, --help          Show this help message
  -v, --version       Show version information
  --gateway-url URL   Gateway URL (default: http://localhost:8000)
  --no-auto           Don't auto-start gateway
  --port PORT         Port for gateway (default: 8000)
  --web-port PORT     Port for web UI (default: 8080)

Examples:
  selfme tui          Start TUI with auto-gateway
  selfme web          Start Web UI with auto-gateway
  selfme gateway      Start gateway server only

  selfme tui --no-auto                    Start TUI without auto-gateway
  selfme tui --gateway-url http://remote:8000  Connect to remote gateway

Note: If using Poetry, prefix commands with 'poetry run', e.g.:
  poetry run selfme tui

For more information, visit: https://github.com/SelfMeAI/SelfMe
"""
    print(help_text)


def check_gateway_running(url: str = "http://localhost:8000") -> bool:
    """Check if Gateway is running.

    Args:
        url: Gateway URL to check.

    Returns:
        True if Gateway is running, False otherwise.
    """
    try:
        response = httpx.get(f"{url}/health", timeout=2)
        return response.status_code == 200
    except Exception:
        return False


def start_gateway_daemon(host: str = "localhost", port: int = 8000) -> subprocess.Popen:
    """Start Gateway as a background process.

    Args:
        host: Host to bind.
        port: Port to bind.

    Returns:
        The subprocess.Popen object.

    Raises:
        RuntimeError: If Gateway fails to start.
    """
    python_exe = sys.executable

    # Start Gateway as subprocess
    process = subprocess.Popen(
        [python_exe, "-m", "selfme", "gateway", "--host", host, "--port", str(port)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
    )

    # Wait for Gateway to start
    max_wait = 10
    for _ in range(max_wait):
        if check_gateway_running(f"http://{host}:{port}"):
            print(f"✓ Gateway started on http://{host}:{port}")
            return process
        time.sleep(1)

    # Failed to start
    process.kill()
    raise RuntimeError("Failed to start Gateway")


def run_gateway(host: str = "localhost", port: int = 8000):
    """Run Gateway server.

    Args:
        host: Host to bind.
        port: Port to bind.
    """
    import uvicorn

    from selfme.config import settings
    from selfme.gateway.app import app

    print(f"Starting SelfMe Gateway on http://{host}:{port}")
    print(f"Model: {settings.llm_model} ({settings.llm_protocol})")
    print("Press Ctrl+C to stop")

    uvicorn.run(app, host=host, port=port)


def run_tui(gateway_url: str = "http://localhost:8000", auto_start: bool = True):
    """Run TUI client.

    Args:
        gateway_url: Gateway URL to connect to.
        auto_start: Whether to auto-start Gateway if not running.
    """
    from selfme.tui.app import SelfMeApp

    gateway_process = None

    # Check if Gateway is running
    if auto_start and not check_gateway_running(gateway_url):
        print("Gateway not found, starting...")
        try:
            # Extract host and port from URL
            from urllib.parse import urlparse

            parsed = urlparse(gateway_url)
            host = parsed.hostname or "localhost"
            port = parsed.port or 8000

            gateway_process = start_gateway_daemon(host, port)
        except Exception as e:
            print(f"Failed to start gateway: {e}")
            print("Please start gateway manually: selfme gateway")
            sys.exit(1)
    elif not auto_start and not check_gateway_running(gateway_url):
        print(f"Gateway not running at {gateway_url}")
        print("Please start gateway first: selfme gateway")
        sys.exit(1)
    else:
        print(f"✓ Connected to gateway at {gateway_url}")

    # Run TUI
    try:
        app = SelfMeApp(gateway_url=gateway_url)
        app.run()
    finally:
        # Clean up: terminate auto-started Gateway
        if gateway_process:
            print("\nShutting down gateway...")
            gateway_process.terminate()
            try:
                gateway_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                gateway_process.kill()


def run_web(gateway_url: str = "http://localhost:8000", auto_start: bool = True, port: int = 8080):
    """Run Web UI server.

    Args:
        gateway_url: Gateway URL to connect to.
        auto_start: Whether to auto-start Gateway if not running.
        port: Port for Web UI server.
    """
    import os

    import uvicorn

    from selfme.web.app import app

    gateway_process = None

    # Check if Gateway is running
    if auto_start and not check_gateway_running(gateway_url):
        print("Gateway not found, starting...")
        try:
            from urllib.parse import urlparse

            parsed = urlparse(gateway_url)
            host = parsed.hostname or "localhost"
            gw_port = parsed.port or 8000

            gateway_process = start_gateway_daemon(host, gw_port)
        except Exception as e:
            print(f"Failed to start gateway: {e}")
            print("Please start gateway manually: selfme gateway")
            sys.exit(1)
    elif not auto_start and not check_gateway_running(gateway_url):
        print(f"Gateway not running at {gateway_url}")
        print("Please start gateway first: selfme gateway")
        sys.exit(1)
    else:
        print(f"✓ Connected to gateway at {gateway_url}")

    # Set environment variable for frontend
    os.environ["VITE_GATEWAY_URL"] = gateway_url

    print(f"Starting Web UI on http://localhost:{port}")
    print(f"Gateway: {gateway_url}")
    print("Press Ctrl+C to stop")

    # Run Web UI
    try:
        uvicorn.run(app, host="0.0.0.0", port=port)
    finally:
        # Clean up: terminate auto-started Gateway
        if gateway_process:
            print("\nShutting down gateway...")
            gateway_process.terminate()
            try:
                gateway_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                gateway_process.kill()


def main():
    """Main entry function."""
    parser = argparse.ArgumentParser(
        description="SelfMe - Personal AI Agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        add_help=False,
    )

    # Positional argument for command
    parser.add_argument(
        "command",
        nargs="?",
        choices=["tui", "web", "gateway"],
        help="Command to run (tui, web, or gateway)",
    )

    # Optional arguments
    parser.add_argument("-h", "--help", action="store_true", help="Show help message")
    parser.add_argument("-v", "--version", action="store_true", help="Show version")
    parser.add_argument(
        "--gateway-url",
        default="http://localhost:8000",
        help="Gateway URL (default: http://localhost:8000)",
    )
    parser.add_argument("--no-auto", action="store_true", help="Don't auto-start gateway")
    parser.add_argument("--host", default="localhost", help="Host for gateway (default: localhost)")
    parser.add_argument("--port", type=int, default=8000, help="Port for gateway (default: 8000)")
    parser.add_argument(
        "--web-port", type=int, default=8080, help="Port for web UI (default: 8080)"
    )

    args = parser.parse_args()

    try:
        # Show version first (before checking command)
        if args.version:
            from selfme.config import settings

            print(f"SelfMe v{settings.app_version}")
            sys.exit(0)

        # Show help if no command or --help flag
        if args.help or args.command is None:
            show_help()
            sys.exit(0)

        # Run command
        if args.command == "gateway":
            run_gateway(host=args.host, port=args.port)
        elif args.command == "tui":
            run_tui(gateway_url=args.gateway_url, auto_start=not args.no_auto)
        elif args.command == "web":
            run_web(gateway_url=args.gateway_url, auto_start=not args.no_auto, port=args.web_port)

    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
