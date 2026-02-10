"""CLI entry point for SelfMe."""

import sys


def show_help():
    """Show help message."""
    help_text = """
SelfMe - Your AI Self

Usage:
  selfme           Launch TUI (Terminal UI) version
  selfme --web     Launch Web UI version
  selfme -w        Launch Web UI version (short form)
  selfme --help    Show this help message
  selfme -h        Show this help message (short form)

Options:
  --web, -w        Start Web UI on http://localhost:7860
  --help, -h       Show this help message

Examples:
  selfme              Start TUI (default)
  selfme --web        Start Web UI
  selfme -w           Start Web UI (short form)

Note: If using Poetry, prefix commands with 'poetry run', e.g.:
  poetry run selfme --web

For more information, visit: https://github.com/SelfMeAI/SelfMe
"""
    print(help_text)


def run_tui():
    """Launch the TUI application."""
    from selfme.tui import SelfMeApp
    SelfMeApp().run()


def run_web():
    """Launch the Web UI application."""
    from selfme.web.app import main as web_main
    web_main()


def main():
    """Main entry function."""
    try:
        # Check for help flag
        if '--help' in sys.argv or '-h' in sys.argv:
            show_help()
            sys.exit(0)
        # Check for --web flag
        elif '--web' in sys.argv or '-w' in sys.argv:
            run_web()
        else:
            run_tui()
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
