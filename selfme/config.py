"""Configuration management for SelfMe."""

import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# 加载 .env 文件
load_dotenv()


class Settings(BaseSettings):
    """应用配置."""

    # LLM API 配置 (通用 OpenAI 兼容格式)
    # 默认使用 Kimi，但可配置其他服务 (OpenAI, Azure, 本地模型等)
    openai_api_key: str = ""
    openai_base_url: str = "https://api.moonshot.cn/v1"  # 默认 Kimi
    openai_model: str = "kimi-k2-5"  # 默认模型

    # 应用配置
    app_name: str = "SelfMe"
    app_version: str = "0.1.0"
    debug: bool = False

    # 数据目录
    data_dir: Path = Path.home() / ".selfme"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # 确保数据目录存在
        self.data_dir.mkdir(parents=True, exist_ok=True)


# 全局配置实例
settings = Settings()
