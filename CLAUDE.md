# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web-AI (OpenTeam) is an AI team collaboration platform that orchestrates multiple AI providers through web automation (no API keys required), API, or local models. It replaces the v1.0 Electron desktop app (archived in `archive/`) with a v2.0 client-server architecture.

## Development Commands

```bash
# Start both frontend and backend (from root)
npm run dev

# Start only the backend (Express + WebSocket on :3001)
npm run server          # or: cd server && npm run dev

# Start only the frontend (Vite on :5199)
npm run client          # or: cd client && npm run dev

# Run server tests
cd server && npm test              # single run
cd server && npm run test:watch    # watch mode

# Type-check everything (TypeScript project references)
npx tsc --build
```

## Architecture

```
client/     React 18 + Vite 5 + TypeScript + Zustand
server/     Express 4 + ws (WebSocket) + sql.js (SQLite/WASM) + Playwright-core
shared/     TypeScript types and WebSocket channel constants imported by both
```

**Communication**: HTTP REST for CRUD, WebSocket for streaming chat and real-time events. Vite dev server proxies `/api` → `:3001` and `/ws` → `ws://localhost:3001`.

**Database**: SQLite via `sql.js` (pure WASM, no native modules). Managed by `DatabaseManager` singleton (`server/src/database/DatabaseManager.ts`). Migrations are inline SQL strings run on startup. Debounced saves (200ms) + auto-save every 5s. WAL mode, foreign keys enabled.

**AI Provider routing** (`server/src/ai/AIRouter.ts`): Routes to `WebAutomation` (Playwright), `ApiClient` (OpenAI-compatible HTTP), or local models based on `provider.type`. Web automation supports mode selection, model selection, and toggle controls (web search, deep think, etc.).

**Browser management** (`server/src/browser/BrowserManager.ts`): Three-tier connection strategy — 1) connect to existing Chrome via CDP (:9222), 2) launch local Chrome with persistent user data dir, 3) fallback to bundled Chromium. Cookie import from default Chrome profile.

**Web automation engine** (`server/src/browser/automation/AutomationEngine.ts`): Handles conversation start, mode/model/toggle selection, filling input with Playwright fill + JS evaluate fallback, multi-strategy send (Enter, Ctrl+Enter, smart button click), and response detection with no-new-text stability polling or stop-button-based wait.

**AI Team engine** (`server/src/team/TeamEngine.ts`): Four execution modes — Pipeline (sequential, each role sees prior outputs), Parallel (all roles run concurrently), Debate, Mixed (parallel groups sequenced). `BaseExecutor` provides shared `executeRole` logic.

**Team chat** uses WebSocket broadcasting: streaming chunks per-role with `team:chat:chunk`, completion with `team:chat:done`, and turn-complete with `team:chat:turn:complete`.

**Frontend state**: Zustand stores (`conversationStore`, `providerStore`, `settingsStore`). `api-client.ts` provides a `window.api` object matching the old Electron preload API — HTTP fetch for CRUD, WebSocket for streaming.

**Built-in providers** (9 total): ChatGPT, Claude, Gemini, DeepSeek, Kimi, 通义千问, 豆包, GLM 智谱, LongCat — defined in `server/src/providers/builtins/` with per-provider CSS selectors.

## Key Conventions

- `@shared/*` alias resolves to `shared/*` in both client and server tsconfig
- All IDs are UUIDs generated with `crypto.randomUUID()` or `uuid` package
- Database models are static methods on Model classes (e.g., `ProviderModel.findById(id)`)
- Server logs via Winston (console + file at `%APPDATA%/web-ai/logs/combined.log`)
- Environment config: copy `.env.example` to `.env`, ports configured via `WEB_AI_PORT` / `WEB_AI_CLIENT_PORT`
- Start scripts: batch files at root (`start-all.bat`, etc.) for Windows; use `npm run dev` for cross-platform
