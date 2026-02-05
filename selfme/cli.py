"""CLI entry point for SelfMe."""

import sys

from selfme.tui import SelfMeApp


def run_app():
    """Launch the TUI application."""
    SelfMeApp().run()


def main():
    """Main entry function."""
    try:
        run_app()
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
