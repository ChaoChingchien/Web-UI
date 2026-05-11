/** ============================================
 *  API 客户端 — 替代 Electron IPC
 *  HTTP fetch (请求-响应) + WebSocket (流式推送)
 *  接口与 archive/src/preload/index.ts 完全一致
 *  ============================================ */

import type {
  AIProvider, Conversation, Message, ChatSendRequest,
  ChatError, AppSettings, ExportFormat, AIRole,
  AITeam, AITeamWithRoles, TeamRun, TeamLogEvent, TeamChatMessageData,
  Project, SubTask, TaskStatus, TaskPriority, TaskAutoDecomposeResult,
  RoleOutput,
} from '@shared/types';

// ===== WebSocket 连接管理 =====

type WsCallback = (data: unknown) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<WsCallback>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;

  connect(): void {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);
        const cbs = this.listeners.get(type);
        if (cbs) {
          for (const cb of cbs) {
            try { cb(data); } catch { /* ignore listener error */ }
          }
        }
      } catch { /* ignore parse error */ }
    };

    this.ws.onclose = () => {
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  send(type: string, data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  on(type: string, callback: WsCallback): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

const ws = new WsClient();

// ===== HTTP fetch 工具 =====

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`);
  return res.json();
}

async function put<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${url} failed: ${res.status}`);
  return res.json();
}

async function del<T = void>(url: string): Promise<T> {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${url} failed: ${res.status}`);
  return res.json();
}

// ===== API 接口（与 Electron preload 完全一致） =====

export const api = {
  chat: {
    send: (request: ChatSendRequest): Promise<{ success: boolean; messageId: string }> => {
      ws.send('chat:send', request);
      return Promise.resolve({ success: true, messageId: 'streaming' });
    },
    onStream: (callback: (data: { conversationId: string; chunk: string }) => void) =>
      ws.on('chat:stream', callback as WsCallback),
    onComplete: (callback: (data: { conversationId: string; messageId: string; dispatchedRole?: { id: string; name: string; icon: string; reason: string } }) => void) =>
      ws.on('chat:complete', callback as WsCallback),
    onError: (callback: (error: ChatError) => void) =>
      ws.on('chat:error', callback as WsCallback),
  },

  conversation: {
    list: (providerId?: string) => get<Conversation[]>(`/api/conversations${providerId ? `?providerId=${providerId}` : ''}`),
    create: (providerId: string, title: string, opts?: { agent?: boolean; agentPrompt?: string }) =>
      post<Conversation>('/api/conversations', { providerId, title, agent: opts?.agent, agentPrompt: opts?.agentPrompt }),
    update: (id: string, data: { title?: string }) => put<void>(`/api/conversations/${id}`, data),
    delete: (id: string) => del(`/api/conversations/${id}`),
    messages: (id: string) => get<Message[]>(`/api/conversations/${id}/messages`),
    setAutoDispatch: (id: string, enabled: boolean) =>
      put<void>(`/api/conversations/${id}/auto-dispatch`, { enabled }),
    sync: (id: string) => post<{ imported: number }>(`/api/conversations/${id}/sync`),
    setAgentMode: (id: string, enabled: boolean, systemPrompt?: string) =>
      put<void>(`/api/conversations/${id}/agent-mode`, { enabled, systemPrompt }),
    setSystemPrompt: (id: string, systemPrompt: string | null) =>
      put<void>(`/api/conversations/${id}/system-prompt`, { systemPrompt }),
    switchProvider: (id: string, providerId: string) =>
      put<void>(`/api/conversations/${id}/switch-provider`, { providerId }),
  },

  provider: {
    list: () => get<AIProvider[]>('/api/providers'),
    add: (provider: Partial<AIProvider>) => post<AIProvider>('/api/providers', provider),
    update: (id: string, data: Partial<AIProvider>) => put<void>(`/api/providers/${id}`, data),
    delete: (id: string) => del(`/api/providers/${id}`),
    test: (id: string) => post<{ success: boolean; message: string }>(`/api/providers/${id}/test`),
    login: (id: string) => post<{ success: boolean; message: string }>(`/api/providers/${id}/login`),
    syncConversations: (id: string) => post<{ imported: number }>(`/api/providers/${id}/sync-conversations`),
  },

  role: {
    list: () => get<AIRole[]>('/api/roles'),
    create: (role: Partial<AIRole>) => post<AIRole>('/api/roles', role),
    update: (id: string, data: Partial<AIRole>) => put<void>(`/api/roles/${id}`, data),
    delete: (id: string) => del(`/api/roles/${id}`),
  },

  team: {
    list: () => get<AITeamWithRoles[]>('/api/teams'),
    create: (data: Partial<AITeam> & { roleIds: { roleId: string; order: number; parallelGroup: number; inputMapping: string }[] }) =>
      post<AITeam>('/api/teams', data),
    update: (id: string, data: Partial<AITeam>) => put<void>(`/api/teams/${id}`, data),
    delete: (id: string) => del(`/api/teams/${id}`),
    run: (teamId: string, input: string) => post<{ success: boolean; result: string }>(`/api/teams/${teamId}/run`, { input }),
    stop: (runId: string) => post<void>(`/api/teams/stop`, { runId }),
    listRuns: (teamId?: string) => get<TeamRun[]>(`/api/team-runs${teamId ? `?teamId=${teamId}` : ''}`),
    runDetail: (runId: string) => get<TeamRun & { outputs: RoleOutput[] }>(`/api/team-runs/${runId}`),
    onLog: (callback: (event: TeamLogEvent) => void) =>
      ws.on('team:log', callback as WsCallback),
    // 群聊相关
    chat: {
      send: (teamId: string, message: string) => {
        ws.send('team:chat:send', { teamId, message });
      },
      history: (teamId: string) => get<TeamChatMessageData[]>(`/api/teams/${teamId}/chat`),
      onMessage: (callback: (msg: TeamChatMessageData) => void) =>
        ws.on('team:chat:message', callback as WsCallback),
      onChunk: (callback: (data: { messageId: string; teamId: string; roleId: string; roleName: string; chunk: string }) => void) =>
        ws.on('team:chat:chunk', callback as WsCallback),
      onDone: (callback: (data: { messageId: string; teamId: string; roleId: string; roleName: string; content: string }) => void) =>
        ws.on('team:chat:done', callback as WsCallback),
      onTurnComplete: (callback: (data: { teamId: string }) => void) =>
        ws.on('team:chat:turn:complete', callback as WsCallback),
      onError: (callback: (data: { type: string; message: string }) => void) =>
        ws.on('team:chat:error', callback as WsCallback),
    },
  },

  project: {
    list: (status?: string) => get<Project[]>(`/api/projects${status ? `?status=${status}` : ''}`),
    create: (data: { name: string; description?: string }) => post<Project>('/api/projects', data),
    update: (id: string, data: Partial<Project>) => put<void>(`/api/projects/${id}`, data),
    delete: (id: string) => del(`/api/projects/${id}`),
  },

  task: {
    list: (projectId: string) => get<SubTask[]>(`/api/projects/${projectId}/tasks`),
    create: (data: { projectId: string; title: string; description?: string; priority?: TaskPriority; assigneeRoleId?: string; assigneeProviderId?: string; parentId?: string; dueDate?: string }) =>
      post<SubTask>('/api/tasks', data),
    update: (id: string, data: Partial<SubTask>) => put<void>(`/api/tasks/${id}`, data),
    delete: (id: string) => del(`/api/tasks/${id}`),
    move: (id: string, status: TaskStatus, order?: number) =>
      post<void>(`/api/tasks/${id}/move`, { status, order }),
    autoDecompose: (projectId: string, goal: string) =>
      post<TaskAutoDecomposeResult>(`/api/projects/${projectId}/auto-decompose`, { goal }),
    commitDecomposition: (projectId: string, tasks: TaskAutoDecomposeResult['tasks']) =>
      post<{ tasks: SubTask[] }>(`/api/projects/${projectId}/commit-decomposition`, { tasks }),
    start: (taskId: string) =>
      post<{ conversationId: string }>(`/api/tasks/${taskId}/start`, {}),
  },

  search: (query: string) => get<Message[]>(`/api/search?q=${encodeURIComponent(query)}`),

  export: {
    markdown: (conversationId: string) => get<string>(`/api/export/markdown?conversationId=${conversationId}`),
    text: (conversationId: string) => get<string>(`/api/export/text?conversationId=${conversationId}`),
    json: (conversationId: string) => get<string>(`/api/export/json?conversationId=${conversationId}`),
  },

  settings: {
    get: () => get<AppSettings>('/api/settings'),
    set: (settings: Partial<AppSettings>) => put<void>('/api/settings', settings),
  },

  log: {
    get: () => get<{ id: number; timestamp: string; level: string; message: string; source: string }[]>('/api/logs'),
    clear: () => post<void>('/api/logs/clear'),
    onNew: (callback: (entry: { id: number; timestamp: string; level: string; message: string; source: string }) => void) =>
      ws.on('log:new', callback as WsCallback),
  },

  window: {
    minimize: () => {},
    maximize: () => {},
    isMaximized: () => Promise.resolve(false),
    close: () => {},
  },
};

// 自动连接 WebSocket
ws.connect();

export type WindowApi = typeof api;
