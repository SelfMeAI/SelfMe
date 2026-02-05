"""CLI 入口."""

import sys

from selfme.tui.app import run_app


def main():
    """主入口函数."""
    try:
        run_app()
    except KeyboardInterrupt:
        print("\n👋 再见！")
        sys.exit(0)
    except Exception as e:
        print(f"错误: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
