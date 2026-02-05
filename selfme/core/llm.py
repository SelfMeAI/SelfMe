"""LLM client wrapper supporting OpenAI and Anthropic protocols."""

from typing import Iterator

from selfme.config import settings


class LLMClient:
    """LLM client supporting multiple API protocols."""

    def __init__(self):
        if not settings.llm_api_key:
            raise ValueError(
                "LLM_API_KEY not set. Please check your .env file."
            )

        self.base_url = settings.llm_base_url
        self.model = settings.llm_model
        self.api_key = settings.llm_api_key
        self.protocol = settings.llm_protocol

        if self.protocol == "anthropic":
            self._init_anthropic()
        else:
            self._init_openai()

    def _init_openai(self):
        """Initialize OpenAI protocol client."""
        from openai import OpenAI
        self.client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
        )

    def _init_anthropic(self):
        """Initialize Anthropic protocol client."""
        try:
            import anthropic
        except ImportError:
            raise ImportError(
                "Anthropic protocol requires the SDK:\n"
                "pip install anthropic"
            )

        self.client = anthropic.Anthropic(
            api_key=self.api_key,
            base_url=self.base_url,
        )

    def chat(self, messages: list[dict]) -> str:
        """
        Send chat request and return complete response.

        Args:
            messages: List of messages in format [{"role": "user", "content": "..."}, ...]

        Returns:
            Complete response string
        """
        try:
            if self.protocol == "anthropic":
                result = self._chat_anthropic(messages)
            else:
                result = self._chat_openai(messages)
            
            # Consume generator and return complete string
            return "".join(result)
            
        except Exception as e:
            return f"[Error] LLM call failed: {e}"

    def chat_stream(self, messages: list[dict]) -> Iterator[str]:
        """
        Send streaming chat request.

        Args:
            messages: List of messages

        Yields:
            Each token string
        """
        try:
            if self.protocol == "anthropic":
                yield from self._chat_anthropic(messages)
            else:
                yield from self._chat_openai(messages)
        except Exception as e:
            yield f"[Error] LLM call failed: {e}"

    def _chat_openai(self, messages: list[dict]) -> Iterator[str]:
        """OpenAI protocol streaming call."""
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            stream=True,
            temperature=0.7,
        )

        for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    def _chat_anthropic(self, messages: list[dict]) -> Iterator[str]:
        """Anthropic protocol streaming call."""
        # Convert message format
        system = ""
        anthropic_messages = []

        for msg in messages:
            if msg["role"] == "system":
                system = msg["content"]
            else:
                anthropic_messages.append({
                    "role": msg["role"],
                    "content": msg["content"],
                })

        kwargs = {
            "model": self.model,
            "messages": anthropic_messages,
            "max_tokens": 4096,
            "stream": True,
        }
        if system:
            kwargs["system"] = system

        response = self.client.messages.create(**kwargs)

        for chunk in response:
            if chunk.type == "content_block_delta" and chunk.delta.text:
                yield chunk.delta.text

    def chat_simple(self, message: str) -> str:
        """Simple chat with single message, returns complete response."""
        messages = [{"role": "user", "content": message}]
        return self.chat(messages)
