"""CLI entry point."""

import sys

from selfme.tui.app import run_app


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
