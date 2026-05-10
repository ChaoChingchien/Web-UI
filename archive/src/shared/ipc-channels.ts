/** ============================================
 *  IPC 通道名常量 (main & renderer 共用)
 *  ============================================ */

export const IPC_CHANNELS = {
  // --- 聊天 ---
  CHAT_SEND: 'chat:send',
  CHAT_STREAM: 'chat:stream',
  CHAT_COMPLETE: 'chat:complete',
  CHAT_ERROR: 'chat:error',

  // --- 对话 ---
  CONVERSATION_LIST: 'conversation:list',
  CONVERSATION_CREATE: 'conversation:create',
  CONVERSATION_DELETE: 'conversation:delete',
  CONVERSATION_MESSAGES: 'conversation:messages',
  CONVERSATION_SEARCH: 'conversation:search',

  // --- 提供商 ---
  PROVIDER_LIST: 'provider:list',
  PROVIDER_ADD: 'provider:add',
  PROVIDER_UPDATE: 'provider:update',
  PROVIDER_DELETE: 'provider:delete',
  PROVIDER_TEST: 'provider:test',

  // --- AI 角色 ---
  ROLE_LIST: 'role:list',
  ROLE_CREATE: 'role:create',
  ROLE_UPDATE: 'role:update',
  ROLE_DELETE: 'role:delete',

  // --- AI Team ---
  TEAM_LIST: 'team:list',
  TEAM_CREATE: 'team:create',
  TEAM_UPDATE: 'team:update',
  TEAM_DELETE: 'team:delete',
  TEAM_RUN: 'team:run',
  TEAM_STOP: 'team:stop',
  TEAM_LOG: 'team:log',
  TEAM_RUN_LIST: 'team:run:list',
  TEAM_RUN_DETAIL: 'team:run:detail',

  // --- 项目管理 ---
  PROJECT_LIST: 'project:list',
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',

  // --- 子任务 ---
  TASK_LIST: 'task:list',
  TASK_CREATE: 'task:create',
  TASK_UPDATE: 'task:update',
  TASK_DELETE: 'task:delete',
  TASK_MOVE: 'task:move',
  TASK_AUTODECOMPOSE: 'task:autodecompose',

  // --- 导出 ---
  EXPORT_MARKDOWN: 'export:markdown',
  EXPORT_TEXT: 'export:text',
  EXPORT_JSON: 'export:json',

  // --- 设置 ---
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // --- 窗口控制 ---
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',
  WINDOW_CLOSE: 'window:close',

  // --- 日志 ---
  LOG_GET: 'log:get',
  LOG_CLEAR: 'log:clear',
  LOG_NEW: 'log:new',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
