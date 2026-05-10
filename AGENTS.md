# Project Instructions

This file provides context for AI assistants working on this project.

## Project Overview

Web-AI (OpenTeam v2.0) — AI 团队协作平台，通过 Web 自动化（无需 API Key）、OpenAI 兼容 API 或本地模型编排多个 AI 提供商。

## Project Type: Node.js + TypeScript

### Commands
- 启动全部（前后端）: `npm run dev`
- 启动后端: `npm run server`（或 `cd server && npm run dev`）
- 启动前端: `npm run client`（或 `cd client && npm run dev`）
- 测试（后端）: `cd server && npm test`
- 测试（监听模式）: `cd server && npm run test:watch`
- 类型检查: `npx tsc --build`
- 安装依赖（根目录）: `npm install`

### 仓库
- 远程: `https://github.com/ChaoChingchien/Web-UI.git`
- 分支: `master`（默认）
- 本地 HEAD: `7f63ba9` — `feat: initial commit - Web-AI / OpenTeam v2.0`

## Architecture

```
client/     React 18 + Vite 5 + TypeScript + Zustand（前端）
server/     Express 4 + ws + sql.js (SQLite WASM) + Playwright-core（后端）
shared/     双方共享的 TypeScript 类型和 WebSocket 频道常量
Web-AI-win32-x64/     Electron v1 桌面版（已存档）
```

- **通信**: HTTP REST 做 CRUD，WebSocket 做流式聊天和实时事件
- **数据库**: SQLite via `sql.js`（纯 WASM，WAL 模式，外键开启）
- **内置提供商（9个）**: ChatGPT, Claude, Gemini, DeepSeek, Kimi, 通义千问, 豆包, GLM 智谱, LongCat
- **AI Team 模式**: Pipeline（串行）、Parallel（并行）、Debate、Mixed（分组串行）

## Project Structure

| 路径 | 说明 |
|------|------|
| `server/src/ai/` | AI 路由分发（WebAutomation / ApiClient / 本地模型） |
| `server/src/browser/` | 浏览器管理与 Web 自动化引擎 |
| `server/src/database/` | SQLite 数据库管理 & 数据模型 |
| `server/src/providers/` | 9 个内置提供商的定义与选择器 |
| `server/src/routes/` | REST API 路由 |
| `server/src/services/` | 业务逻辑层 |
| `server/src/team/` | AI Team 执行引擎 |
| `server/src/ws/` | WebSocket 处理 |
| `client/src/stores/` | Zustand 状态管理 |
| `client/src/components/` | React 组件 |
| `shared/` | 共享的 TypeScript 类型定义 |

## Guidelines

- 遵循现有代码风格和模式
- 新功能需要编写测试
- 保持改动聚焦和原子化
- 公共 API 需要文档注释
- 所有 ID 使用 UUID（`crypto.randomUUID()` 或 `uuid` 包）
- `@shared/*` 别名解析到 `shared/*`（客户端和服务端 tsconfig 均已配置）
- 环境配置：复制 `.env.example` 为 `.env`，端口通过 `WEB_AI_PORT` / `WEB_AI_CLIENT_PORT` 配置
- 日志通过 Winston 输出（控制台 + 文件 `%APPDATA%/web-ai/logs/combined.log`）
- 启动脚本：Windows 下可用 `start-all.bat` / `start-server.bat` / `start-client.bat`

## Useful Patterns

- **数据库模型**：Model 类上的静态方法（如 `ProviderModel.findById(id)`）
- **API 客户端**：`window.api` 对象（`api-client.ts`），兼容旧 Electron preload API
- **浏览器连接策略**（三层回退）：1) 连接已有 Chrome CDP(:9222) → 2) 启动本地 Chrome 持久用户目录 → 3) 回退到内置 Chromium
- **环境变量**：`PORT` (3001)、`CLIENT_URL` (http://localhost:5199)、`DATA_DIR`、`LOG_LEVEL`

## Important Notes

- 当前仓库与远程 GitHub 完全同步（唯一提交 `7f63ba9`）
- 工作区已清理，无未提交更改
- 项目是 v2.0 重建版，旧的 v1.0 Electron 代码在 `archive/` 目录
- 详细设计文档见 `docs/项目设计文档.md`
- 待办事项见 `docs/待完善事项.md`
