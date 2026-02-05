"""Configuration management for SelfMe."""

from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load .env file
load_dotenv()


class Settings(BaseSettings):
    """Application settings."""

    # LLM API Configuration (supports OpenAI / Anthropic protocols)
    llm_protocol: str = "openai"  # openai | anthropic
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = "gpt-4"  # e.g., gpt-4, kimi-k2-5, claude-3-opus, etc.

    # Application settings
    app_name: str = "SelfMe"
    app_version: str = "0.1.0"
    debug: bool = False

    # Data directory
    data_dir: Path = Path.home() / ".selfme"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Ensure data directory exists
        self.data_dir.mkdir(parents=True, exist_ok=True)


# Global settings instance
settings = Settings()
