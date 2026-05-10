/** ============================================
 *  共享类型定义 (main & renderer 共用)
 *  ============================================ */

// ===== 基础类型 =====

export type ProviderType = 'web' | 'api' | 'local';
export type ExportFormat = 'markdown' | 'text' | 'json';

/** AI 提供商 */
export interface AIProvider {
  id: string;
  name: string;
  icon: string;
  type: ProviderType;
  is_custom: boolean;
  is_enabled: boolean;
  // Web 自动化配置
  url?: string;
  web_config?: WebAutomationConfig;
  // API 配置 (OpenAI 兼容)
  api_config?: ApiConfig;
  // 本地模型配置 (Ollama / LM Studio)
  local_config?: ApiConfig;
  created_at: string;
  updated_at: string;
}

/** Web 自动化配置 */
export interface WebAutomationConfig {
  selectors: {
    input: string;
    sendButton: string;
    responseContainer: string;
    responseText: string;
    stopButton?: string;
    loginIndicator?: string;
    fallbackSelectors?: {
      input: string[];
      sendButton: string[];
      responseContainer: string[];
    };
  };
  waitStrategy: 'stopButton' | 'noNewText';
  waitOptions: {
    pollingIntervalMs: number;
    noNewTextTimeoutMs: number;
    fallbackTimeoutMs: number;
  };
}

/** API / 本地模型配置 */
export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
}

/** 对话 */
export interface Conversation {
  id: string;
  provider_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

/** 消息 */
export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

/** 应用设置 */
export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  sidebarWidth: number;
}

/** 窗口状态 */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ===== AI Team 类型 =====

export type TeamMode = 'pipeline' | 'parallel' | 'debate' | 'mixed';
export type InputMapping = 'original' | 'previous' | 'all_previous';

/** AI 角色 */
export interface AIRole {
  id: string;
  name: string;
  icon: string;
  system_prompt: string;
  provider_id: string;
  config: {
    temperature: number;
    max_tokens: number;
  };
  is_custom: boolean;
  created_at: string;
  updated_at: string;
}

/** Team 中的角色配置 */
export interface TeamRole {
  id: string;
  team_id: string;
  role_id: string;
  role_order: number;
  parallel_group: number;
  input_mapping: InputMapping;
}

/** AI Team */
export interface AITeam {
  id: string;
  name: string;
  description: string;
  mode: TeamMode;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Team 执行时的角色信息（含角色详情） */
export interface AITeamWithRoles extends AITeam {
  roles: (TeamRole & { role: AIRole })[];
}

/** Team 执行记录 */
export interface TeamRun {
  id: string;
  team_id: string;
  input: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  final_output: string;
  started_at: string;
  completed_at?: string;
}

/** 角色执行输出 */
export interface RoleOutput {
  id: string;
  run_id: string;
  role_id: string;
  role_name: string;
  input_text: string;
  output_text: string;
  status: 'pending' | 'running' | 'done' | 'error';
  error_text: string;
  started_at?: string;
  completed_at?: string;
}

// ===== 子任务管理类型 =====

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ProjectStatus = 'active' | 'completed' | 'archived';

/** 项目 */
export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

/** 子任务 */
export interface SubTask {
  id: string;
  project_id: string;
  parent_id?: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_role_id?: string;
  assignee_provider_id?: string;
  conversation_id?: string;
  task_order: number;
  due_date?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

// ===== API 请求/响应类型 =====

export interface ChatSendRequest {
  providerId: string;
  conversationId: string;
  message: string;
}

export interface ChatReply {
  conversationId: string;
  messageId: string;
  role: 'assistant';
  content: string;
}

export interface ChatError {
  requestId: string;
  type: string;
  message: string;
  isRetryable: boolean;
  partialContent?: string;
}

export interface TeamRunRequest {
  teamId: string;
  input: string;
}

export interface TeamLogEvent {
  runId: string;
  type: 'role_start' | 'role_complete' | 'role_error' | 'team_complete' | 'team_error';
  roleId?: string;
  roleName?: string;
  content?: string;
  error?: string;
}

export interface TaskAutoDecomposeResult {
  tasks: {
    title: string;
    description: string;
    priority: TaskPriority;
    suggestedRoleId?: string;
    suggestedProviderId?: string;
  }[];
}
