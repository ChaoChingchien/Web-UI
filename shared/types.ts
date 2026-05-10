/** ============================================
 *  共享类型定义 (main & renderer 共用)
 *  ============================================ */

// ===== 基础类型 =====

export type ProviderType = 'web' | 'api' | 'local';
export type ExportFormat = 'markdown' | 'text' | 'json';

/** 能力档位，用于多模型编排路由 */
export type CapabilityTier = 'L0' | 'L1' | 'L2';

/** Provider 能力元数据（用于多模型编排的档位路由） */
export interface ProviderCapabilities {
  strengths?: ('reasoning' | 'coding' | 'writing' | 'vision' | 'multilingual' | 'long_context')[];
  cost_tier?: 'low' | 'medium' | 'high';
  speed_tier?: 'fast' | 'medium' | 'slow';
  context_k?: number;
  best_for_levels?: CapabilityTier[];
}

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
  // 能力元数据（用于多模型编排的档位路由）
  capabilities?: ProviderCapabilities;
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
  /** 模式选择（如 DeepSeek 的快速/专家/识图模式） */
  modeSelector?: {
    container: string;
    buttons: { name: string; selector: string }[];
    defaultMode: string;
  };
  /** 模型选择（如 ChatGPT 的 GPT-4o/o3, Claude 的 Opus/Sonnet 等） */
  modelSelector?: {
    container: string;
    buttons: { name: string; selector: string }[];
    defaultModel: string;
  };
  /** 开关控件（如联网搜索、深度思考等） */
  toggles?: {
    label: string;
    selector: string;
    container?: string;
    defaultOn?: boolean;
  }[];
  /** 对话启动配置（用于需要先点击进入聊天界面的提供商，如 Claude 的新版启动页） */
  conversationStart?: {
    /** 导航到新对话 URL（如 "/new"），优先级高于 clickStarter */
    url?: string;
    /** 点击启动对话的选择器（如 Claude 的 "开始新对话" 按钮），仅在 url 未设置时使用 */
    clickStarter?: string;
    /** 对话风格选择器（如 Claude 的 "Claude's choice"），在 clickStarter 之后点击 */
    starterStyle?: string;
    /** 启动后等待时间，毫秒（默认 3000） */
    waitAfterMs?: number;
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
  /** 对应网页端真实对话的 URL（仅 web 自动化 provider 在首次发送后写入） */
  web_url?: string;
  /** 是否开启消息级自动角色调度（由分类器挑选角色） */
  auto_dispatch?: boolean;
  /** Agent 模式：允许在对话中切换 provider，所有消息共享同一上下文 */
  agent_mode?: boolean;
  /** Agent 模式下的系统提示词（Agent 角色定义） */
  agent_system_prompt?: string;
  created_at: string;
  updated_at: string;
}

/** 消息 */
export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** 自动调度选中的角色 ID（若该助手回复是由调度器路由产生的） */
  dispatched_role_id?: string;
  /** 调度器给出的一句话理由 */
  dispatch_reason?: string;
  created_at: string;
}

/** 嵌入服务提供者 */
export type EmbeddingProvider = 'local' | 'api';

/** 嵌入/语义记忆配置 */
export interface EmbeddingConfig {
  /** 是否启用语义记忆 */
  enabled: boolean;
  /** 提供者：local（本机 @xenova/transformers）或 api（兼容接口） */
  provider: EmbeddingProvider;
  /** API 端点（仅 provider=api 时使用，兼容 OpenAI/Ollama 格式） */
  apiUrl: string;
  /** API 模型名（仅 provider=api 时使用） */
  apiModel: string;
}

/** 应用设置 */
export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  accentColor: string;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  /** Web 自动化浏览器是否在后台运行（不弹 GUI 窗口） */
  headless: boolean;
  /** 语义记忆（向量嵌入）配置 */
  embedding: EmbeddingConfig;
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
  provider_overrides: string[];
  conversation_id?: string;
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
  mode?: string;
  model?: string;
  toggles?: Record<string, boolean>;
}

export interface ChatError {
  requestId: string;
  type: string;
  message: string;
  isRetryable: boolean;
  partialContent?: string;
}

export interface TeamLogEvent {
  runId: string;
  type: 'role_start' | 'role_complete' | 'role_error' | 'team_complete' | 'team_error';
  roleId?: string;
  roleName?: string;
  content?: string;
  error?: string;
}

/** Team 聊天消息（群聊） */
export interface TeamChatMessageData {
  id: string;
  team_id: string;
  role_id: string | null;
  role_name: string | null;
  role_icon: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'streaming' | 'done' | 'error';
  created_at: string;
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
