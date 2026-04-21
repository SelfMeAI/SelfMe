# SelfMe

> Your AI Self

当前仓库已经完成 Phase 0 的主迁移，后续工作进入 `Phase 0 收尾 / 重塑`。

## 当前结构

```text
apps/
  gateway/
  web/
  desktop/
  tui/
packages/
  chat-ui/
  protocol/
scripts/
  smoke/
docs/
  phase-0-checklist.md
```

## 技术栈

| 层级 | 技术 |
|------|------|
| Gateway | Fastify + TypeScript |
| LLM 调用 | OpenAI SDK + Anthropic 协议 |
| Web UI | Next.js + React + TypeScript |
| Desktop | Electron + React + TypeScript |
| TUI | Ink + React + TypeScript |

## 快速开始

```bash
pnpm install
cp .env.example .env
```

## 启动

### Gateway

```bash
pnpm dev:gateway
```

默认地址：

- HTTP: `http://localhost:8000`
- WebSocket: `ws://localhost:8000/ws`

### Web

```bash
pnpm dev:web
```

### Desktop

```bash
pnpm dev:desktop
```

需要拆分调试时：

```bash
pnpm dev:desktop:renderer
pnpm dev:desktop:main
```

### TUI

```bash
pnpm dev:tui
```

## 验证

Gateway 协议烟测：

```bash
pnpm --filter @selfme/gateway build
pnpm smoke:gateway
```

这套烟测会验证：

- `/health` 基础状态
- Modern WebSocket 会话绑定
- Modern WebSocket 流式完成
- Modern WebSocket 取消

## 当前重点

当前所有收尾任务见 [docs/phase-0-checklist.md](/Users/q1d40/Documents/Work/selfme/git/SelfMe/docs/phase-0-checklist.md)。
