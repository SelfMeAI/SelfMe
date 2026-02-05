"""聊天界面组件."""

from textual.containers import Vertical
from textual.widgets import Input, RichLog, Static

from selfme.core.llm import LLMClient
from selfme.core.memory import MemoryStore


class ChatContainer(Vertical):
    """聊天容器组件."""

    DEFAULT_CSS = """
    ChatContainer {
        height: 100%;
    }

    #chat-history {
        height: 1fr;
        border: solid $primary-darken-2;
        padding: 1;
        background: $surface-darken-2;
    }

    #chat-input {
        height: 3;
        margin: 0;
    }

    #chat-input:focus {
        border: tall $primary;
    }

    .user-message {
        color: $text;
        background: $primary-darken-3;
        padding: 0 1;
        margin: 0 0 1 0;
    }

    .assistant-message {
        color: $text;
        background: $surface-darken-1;
        padding: 0 1;
        margin: 0 0 1 0;
    }
    """

    def __init__(self):
        super().__init__()
        self.memory = MemoryStore()
        self.llm = None
        self.is_generating = False

    def compose(self):
        """构建组件."""
        # 聊天历史显示区
        yield RichLog(id="chat-history", highlight=True, wrap=True)
        # 输入框
        yield Input(placeholder="输入消息，按 Enter 发送...", id="chat-input")

    def on_mount(self):
        """组件挂载时初始化."""
        try:
            self.llm = LLMClient()
            self.add_system_message(
                f"🦞 欢迎回来，七道师！\n"
                f"🐙 SelfMe v0.1.0 已就绪\n"
                f"[dim]模型: {self.llm.model}[/dim]"
            )
        except ValueError as e:
            self.add_system_message(f"⚠️ 初始化失败: {e}\n请检查 .env 文件中的 OPENAI_API_KEY")

    def on_input_submitted(self, event: Input.Submitted):
        """处理输入提交."""
        if not event.value.strip() or self.is_generating:
            return

        user_message = event.value.strip()

        # 清空输入框
        input_widget = self.query_one("#chat-input", Input)
        input_widget.value = ""

        # 添加用户消息
        self.add_user_message(user_message)

        # 调用 LLM 生成回复
        self.generate_response(user_message)

    def add_user_message(self, content: str):
        """添加用户消息到显示区."""
        history = self.query_one("#chat-history", RichLog)
        history.write(f"[b]你:[/b] {content}")
        self.memory.add("user", content)

    def add_assistant_message(self, content: str):
        """添加助手消息到显示区."""
        history = self.query_one("#chat-history", RichLog)
        history.write(f"[b]🐙:[/b] {content}")
        self.memory.add("assistant", content)

    def add_system_message(self, content: str):
        """添加系统消息."""
        history = self.query_one("#chat-history", RichLog)
        history.write(f"[dim]{content}[/dim]")

    def generate_response(self, user_message: str):
        """生成 LLM 回复 (流式)."""
        if not self.llm:
            return

        self.is_generating = True
        history = self.query_one("#chat-history", RichLog)

        # 获取完整上下文
        messages = self.memory.to_llm_format(n=10)  # 最近10条作为上下文

        # 流式生成，收集完整响应
        full_response = ""
        for token in self.llm.chat(messages, stream=True):
            full_response += token

        # 一次性显示完整回复
        history.write(f"[b]🐙:[/b] {full_response}")
        self.memory.add("assistant", full_response)
        self.is_generating = False

    def clear_chat(self):
        """清空对话."""
        self.memory.clear()
        history = self.query_one("#chat-history", RichLog)
        history.clear()
        self.add_system_message("🗑️ 对话已清空")
