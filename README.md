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
```

## 启动

### Gateway

```bash
pnpm dev:gateway
```

默认地址：

- HTTP: `http://127.0.0.1:8000`
- WebSocket: `ws://127.0.0.1:8000/ws`

### Web

```bash
pnpm dev:web
```

### Desktop

```bash
pnpm dev:desktop
```

桌面端会优先复用已运行的 Gateway；如果本地没有运行中的 Gateway，会按 `.selfme/app.json` 自动拉起。

需要拆分调试时：

```bash
pnpm dev:desktop:renderer
pnpm dev:desktop:main
```

打包 macOS `.app`：

```bash
pnpm package:desktop:mac
```

产物位置：

- `apps/desktop/dist-app/mac-arm64/SelfMe.app`

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

Smoke 运行时会隔离自己的本地配置路径，避免被仓库里的 `.selfme/` 持久化设置污染。

## 本地配置

运行期本地配置位于 `.selfme/`：

- `settings.json`: 用户模型设置
- `app.json`: 应用运行配置

桌面打包态会改用用户目录下的 `~/.selfme/settings.json`，并由桌面端内部固定托管 Gateway 运行参数；`app.json` 仅保留给开发态。

## 当前重点

当前所有收尾任务见 [docs/phase-0-checklist.md](/Users/q1d40/Documents/Work/selfme/git/SelfMe/docs/phase-0-checklist.md)。
