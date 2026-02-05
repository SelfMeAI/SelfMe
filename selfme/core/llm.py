"""LLM 调用封装 - 通用 OpenAI 兼容 API."""

from typing import Iterator

from openai import OpenAI

from selfme.config import settings


class LLMClient:
    """LLM 客户端，支持任意 OpenAI 兼容 API (Kimi, OpenAI, Azure, 本地等)."""

    def __init__(self):
        if not settings.openai_api_key:
            raise ValueError(
                "OPENAI_API_KEY not set. Please check your .env file.\n"
                "默认使用 Kimi: https://platform.moonshot.cn/"
            )

        self.client = OpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
        self.model = settings.openai_model

    def chat(self, messages: list[dict], stream: bool = True) -> Iterator[str] | str:
        """
        发送聊天请求.

        Args:
            messages: 消息列表，格式 [{"role": "user", "content": "..."}, ...]
            stream: 是否流式返回

        Returns:
            流式返回时: 生成器，每次 yield 一个 token
            非流式返回时: 完整响应字符串
        """
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=stream,
                temperature=0.7,
            )

            if stream:
                for chunk in response:
                    if chunk.choices and chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            else:
                return response.choices[0].message.content

        except Exception as e:
            error_msg = f"[错误] LLM 调用失败: {e}"
            if stream:
                yield error_msg
            else:
                return error_msg

    def chat_simple(self, message: str) -> Iterator[str]:
        """简单对话，单条消息，返回流式响应."""
        messages = [{"role": "user", "content": message}]
        yield from self.chat(messages, stream=True)
