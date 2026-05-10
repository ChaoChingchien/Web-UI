import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type {
  AIProvider, Conversation, Message, ChatSendRequest, ChatError,
  AppSettings, ExportFormat, AIRole, AITeam, AITeamWithRoles, TeamRun, TeamLogEvent,
  Project, SubTask, TaskStatus, TaskPriority, TaskAutoDecomposeResult,
  RoleOutput,
} from '@shared/types';

interface LogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: string;
}

const api = {
  /** 聊天 */
  chat: {
    send: (request: ChatSendRequest): Promise<{ success: boolean; messageId: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND, request),
    onStream: (callback: (data: { conversationId: string; chunk: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { conversationId: string; chunk: string }) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM, handler);
    },
    onComplete: (callback: (data: { conversationId: string; messageId: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { conversationId: string; messageId: string }) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.CHAT_COMPLETE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_COMPLETE, handler);
    },
    onError: (callback: (error: ChatError) => void) => {
      const handler = (_: Electron.IpcRendererEvent, error: ChatError) => callback(error);
      ipcRenderer.on(IPC_CHANNELS.CHAT_ERROR, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_ERROR, handler);
    },
  },

  /** 对话 */
  conversation: {
    list: (providerId?: string): Promise<Conversation[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_LIST, providerId),
    create: (providerId: string, title: string): Promise<Conversation> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_CREATE, providerId, title),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_DELETE, id),
    messages: (id: string): Promise<Message[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_MESSAGES, id),
  },

  /** 提供商 */
  provider: {
    list: (): Promise<AIProvider[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_LIST),
    add: (provider: Partial<AIProvider>): Promise<AIProvider> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_ADD, provider),
    update: (id: string, data: Partial<AIProvider>): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_UPDATE, id, data),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_DELETE, id),
    test: (id: string): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_TEST, id),
  },

  /** AI 角色 */
  role: {
    list: (): Promise<AIRole[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.ROLE_LIST),
    create: (role: Partial<AIRole>): Promise<AIRole> =>
      ipcRenderer.invoke(IPC_CHANNELS.ROLE_CREATE, role),
    update: (id: string, data: Partial<AIRole>): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.ROLE_UPDATE, id, data),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.ROLE_DELETE, id),
  },

  /** AI Team */
  team: {
    list: (): Promise<AITeamWithRoles[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.TEAM_LIST),
    create: (data: Partial<AITeam> & { roleIds: { roleId: string; order: number; parallelGroup: number; inputMapping: string }[] }): Promise<AITeam> =>
      ipcRenderer.invoke(IPC_CHANNELS.TEAM_CREATE, data),
    update: (id: string, data: Partial<AITeam>): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TEAM_UPDATE, id, data),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TEAM_DELETE, id),
    run: (teamId: string, input: string): Promise<{ success: boolean; result: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.TEAM_RUN, { teamId, input }),
    stop: (runId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TEAM_STOP, runId),
    listRuns: (teamId?: string): Promise<TeamRun[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.TEAM_RUN_LIST, teamId),
    runDetail: (runId: string): Promise<TeamRun & { outputs: RoleOutput[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.TEAM_RUN_DETAIL, runId),
    onLog: (callback: (event: TeamLogEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: TeamLogEvent) => callback(event);
      ipcRenderer.on(IPC_CHANNELS.TEAM_LOG, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TEAM_LOG, handler);
    },
  },

  /** 项目 */
  project: {
    list: (status?: string): Promise<Project[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST, status),
    create: (data: { name: string; description?: string }): Promise<Project> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, data),
    update: (id: string, data: Partial<Project>): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE, id, data),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DELETE, id),
  },

  /** 子任务 */
  task: {
    list: (projectId: string): Promise<SubTask[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_LIST, projectId),
    create: (data: { projectId: string; title: string; description?: string; priority?: TaskPriority; assigneeRoleId?: string; assigneeProviderId?: string; parentId?: string; dueDate?: string }): Promise<SubTask> =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_CREATE, data),
    update: (id: string, data: Partial<SubTask>): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_UPDATE, id, data),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_DELETE, id),
    move: (id: string, status: TaskStatus, order?: number): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_MOVE, id, status, order),
    autoDecompose: (projectId: string, goal: string): Promise<TaskAutoDecomposeResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_AUTODECOMPOSE, projectId, goal),
  },

  /** 搜索 */
  search: (query: string): Promise<Message[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_SEARCH, query),

  /** 导出 */
  export: {
    markdown: (conversationId: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_MARKDOWN, conversationId),
    text: (conversationId: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_TEXT, conversationId),
    json: (conversationId: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_JSON, conversationId),
  },

  /** 设置 */
  settings: {
    get: (): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    set: (settings: Partial<AppSettings>): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings),
  },

  /** 日志 */
  log: {
    get: (): Promise<LogEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOG_GET),
    clear: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOG_CLEAR),
    onNew: (callback: (entry: LogEntry) => void) => {
      const handler = (_: Electron.IpcRendererEvent, entry: LogEntry) => callback(entry);
      ipcRenderer.on(IPC_CHANNELS.LOG_NEW, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.LOG_NEW, handler);
    },
  },

  /** 窗口控制 */
  window: {
    minimize: (): void => { ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE); },
    maximize: (): void => { ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE); },
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
    close: (): void => { ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE); },
  },
};

contextBridge.exposeInMainWorld('api', api);

export type WindowApi = typeof api;
