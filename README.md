# SelfMe - Your AI Self

🐙 **SelfMe** 是一个个人化身智能体，与你的数字自我唯一绑定。

## 愿景

> Your AI Self

- **终身记忆** - 从第一天开始累积，跨越所有对话
- **人格镜像** - 学习你的风格、习惯、决策模式
- **自我演化** - 代码自改写，千人千面的智能体

## 技术栈

- **后端**: Python 3.10+
- **TUI**: Textual
- **LLM**: Moonshot AI (Kimi K2.5)
- **记忆**: 本地向量存储 (后续版本)

## 快速开始

### 1. 安装依赖

```bash
# 使用 Poetry (推荐)
poetry install

# 或使用 pip
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，填入你的 API Key：

```bash
cp .env.example .env
```

编辑 `.env`：

```test
KIMI_API_KEY=your_api_key_here
```

### 3. 运行

```bash
# 使用 Poetry
poetry run selfme

# 或直接使用 Python
python -m selfme
```

## 开发

```bash
# 代码检查
poetry run ruff check .

# 格式化
poetry run ruff format .
```

## 项目结构

```text
selfme/
├── cli.py              # CLI 入口
├── config.py           # 配置管理
├── core/
│   ├── llm.py          # LLM 调用封装
│   └── memory.py       # 记忆系统
└── tui/
    ├── app.py          # TUI 主应用
    ├── chat.py         # 聊天界面
    └── widgets.py      # 自定义组件
```

---

Powered by 🦞 & 🐙
