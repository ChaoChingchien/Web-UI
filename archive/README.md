# Web-AI

AI 网页版自动化对话中间件 — 类似 CherryStudio 的桌面应用。

## 核心功能

- **原生聊天界面** — 用户在自己的 UI 中与 AI 对话
- **后台自动化** — 通过 Playwright 自动操控 AI 网页（填表、点击、抓取回复）
- **对话持久化** — 所有对话保存到本地 SQLite，支持搜索
- **多 AI 支持** — 内置 ChatGPT、Claude、Gemini、DeepSeek，支持自定义添加
- **导出功能** — 支持导出为 Markdown、纯文本、JSON

## 技术栈

- Electron + React + TypeScript + Vite
- Playwright (网页自动化)
- sql.js (本地数据库)
- Zustand (状态管理)

## 开发

```bash
# 安装依赖
npm install

# 安装 Playwright Chromium
npx playwright install chromium

# 启动开发服务器
npm start
```

## 项目结构

```
src/
├── main/           # Electron 主进程
│   ├── browser/    # Playwright 浏览器管理 + 自动化引擎
│   ├── database/   # SQLite 数据库 + Model
│   ├── providers/  # 内置 AI 提供商配置
│   └── export/     # 导出管理器
├── preload/        # contextBridge API
├── renderer/       # React 前端
│   ├── components/ # UI 组件
│   ├── stores/     # Zustand 状态管理
│   └── styles/     # CSS 样式
└── shared/         # 共享类型和常量
```

## 文档

详细设计文档见 [docs/项目设计文档.md](docs/项目设计文档.md)
