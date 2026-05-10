import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { getStore } from './store';
import { DatabaseManager } from './database/DatabaseManager';
import { ProviderModel, ConversationModel, MessageModel, RoleModel, TeamModel, TeamRunModel, TeamRunOutputModel } from './database/models';
import { AIRouter } from './ai/AIRouter';
import { TeamEngine } from './team/TeamEngine';
import { TaskManager } from './task/TaskManager';
import type { AppSettings, ChatSendRequest, AIRole, AIProvider } from '@shared/types';
import { getLogs, clearLogs } from './logging/LogCollector';
import log from 'electron-log';
import { ExportManager } from './export/ExportManager';


/** ============================================
 *  IPC 处理器注册
 *  ============================================ */

const router = new AIRouter();
const teamEngine = new TeamEngine();
const taskManager = new TaskManager();

export function registerIpcHandlers(): void {
  const db = DatabaseManager.getInstance();

  // ===== 聊天 =====
  ipcMain.handle(IPC_CHANNELS.CHAT_SEND, async (event, request: ChatSendRequest) => {
    log.info('收到聊天请求:', request.providerId, request.message.substring(0, 50));
    try {
      MessageModel.create(request.conversationId, 'user', request.message);
      ConversationModel.touch(request.conversationId);

      const provider = ProviderModel.findById(request.providerId);
      if (!provider) throw new Error('提供商不存在');

      const sender = event.sender;
      let fullOutput = '';

      // API/Local 模式需要带上对话历史，Web 模式仅发送当前消息
      const messages = provider.type === 'web'
        ? [{ role: 'user' as const, content: request.message }]
        : MessageModel.findByConversation(request.conversationId)
            .map((m) => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content }));

      await router.chatStream(
        provider,
        messages,
        (chunk) => {
          fullOutput += chunk;
          sender.send(IPC_CHANNELS.CHAT_STREAM, { conversationId: request.conversationId, chunk });
        },
        () => {
          const reply = MessageModel.create(request.conversationId, 'assistant', fullOutput);
          ConversationModel.touch(request.conversationId);
          sender.send(IPC_CHANNELS.CHAT_COMPLETE, { conversationId: request.conversationId, messageId: reply.id });
        },
        (err) => {
          log.error('流式聊天失败:', err);
          const errorMsg = `[错误] ${err.message}`;
          MessageModel.create(request.conversationId, 'assistant', errorMsg);
          sender.send(IPC_CHANNELS.CHAT_ERROR, { requestId: request.conversationId, type: 'stream_error', message: err.message, isRetryable: true } as any);
        }
      );

      return { success: true, messageId: 'streaming' };
    } catch (error) {
      log.error('聊天请求失败:', error);
      const errorMsg = `[错误] ${error instanceof Error ? error.message : '未知错误'}`;
      MessageModel.create(request.conversationId, 'assistant', errorMsg);
      throw error;
    }
  });

  // ===== 对话 =====
  ipcMain.handle(IPC_CHANNELS.CONVERSATION_LIST, (_, providerId?: string) => ConversationModel.findAll(providerId));
  ipcMain.handle(IPC_CHANNELS.CONVERSATION_CREATE, (_, providerId: string, title: string) => ConversationModel.create(providerId, title));
  ipcMain.handle(IPC_CHANNELS.CONVERSATION_DELETE, (_, id: string) => { ConversationModel.delete(id); });
  ipcMain.handle(IPC_CHANNELS.CONVERSATION_MESSAGES, (_, id: string) => MessageModel.findByConversation(id));

  // ===== 提供商 =====
  ipcMain.handle(IPC_CHANNELS.PROVIDER_LIST, () => ProviderModel.findAll());
  ipcMain.handle(IPC_CHANNELS.PROVIDER_ADD, (_, provider) => ProviderModel.create(provider));
  ipcMain.handle(IPC_CHANNELS.PROVIDER_UPDATE, (_, id: string, data: Partial<AIProvider>) => { ProviderModel.update(id, data); });
  ipcMain.handle(IPC_CHANNELS.PROVIDER_DELETE, (_, id: string) => { ProviderModel.delete(id); });
  ipcMain.handle(IPC_CHANNELS.PROVIDER_TEST, async (_, id: string) => {
    const provider = ProviderModel.findById(id);
    if (!provider) return { success: false, message: '提供商不存在' };
    return router.testProvider(provider);
  });

  // ===== AI 角色 =====
  ipcMain.handle(IPC_CHANNELS.ROLE_LIST, () => RoleModel.findAll());
  ipcMain.handle(IPC_CHANNELS.ROLE_CREATE, (_, role) => RoleModel.create(role));
  ipcMain.handle(IPC_CHANNELS.ROLE_UPDATE, (_, id: string, data: Partial<AIRole>) => { RoleModel.update(id, data); });
  ipcMain.handle(IPC_CHANNELS.ROLE_DELETE, (_, id: string) => { RoleModel.delete(id); });

  // ===== AI Team =====
  ipcMain.handle(IPC_CHANNELS.TEAM_LIST, () => TeamModel.findAll());
  ipcMain.handle(IPC_CHANNELS.TEAM_CREATE, (_, data) => TeamModel.create(data));
  ipcMain.handle(IPC_CHANNELS.TEAM_UPDATE, (_, id: string, data) => { TeamModel.update(id, data); });
  ipcMain.handle(IPC_CHANNELS.TEAM_DELETE, (_, id: string) => { TeamModel.delete(id); });

  ipcMain.handle(IPC_CHANNELS.TEAM_RUN, async (event, data: { teamId: string; input: string }) => {
    const team = TeamModel.findById(data.teamId);
    if (!team) throw new Error('Team 不存在');

    // 使用 event.sender 发送日志事件到 renderer
    const sender = event.sender;

    try {
      const result = await teamEngine.run(team, data.input, (logEvent) => {
        sender.send(IPC_CHANNELS.TEAM_LOG, logEvent);
      });
      return { success: true, result };
    } catch (err) {
      throw err;
    }
  });

  ipcMain.handle(IPC_CHANNELS.TEAM_STOP, (_, runId: string) => {
    teamEngine.stop(runId);
  });

  ipcMain.handle(IPC_CHANNELS.TEAM_RUN_LIST, (_, teamId?: string) => TeamRunModel.findAll(teamId));
  ipcMain.handle(IPC_CHANNELS.TEAM_RUN_DETAIL, (_, runId: string) => {
    const run = TeamRunModel.findById(runId);
    if (!run) return null;
    const outputs = TeamRunOutputModel.findByRunId(runId);
    return { ...run, outputs };
  });

  // ===== 项目管理 =====
  ipcMain.handle(IPC_CHANNELS.PROJECT_LIST, (_, status?: string) => taskManager.listProjects(status as any));
  ipcMain.handle(IPC_CHANNELS.PROJECT_CREATE, (_, data) => taskManager.createProject(data));
  ipcMain.handle(IPC_CHANNELS.PROJECT_UPDATE, (_, id: string, data) => { taskManager.updateProject(id, data); });
  ipcMain.handle(IPC_CHANNELS.PROJECT_DELETE, (_, id: string) => { taskManager.deleteProject(id); });

  // ===== 子任务 =====
  ipcMain.handle(IPC_CHANNELS.TASK_LIST, (_, projectId: string) => taskManager.listTasks(projectId));
  ipcMain.handle(IPC_CHANNELS.TASK_CREATE, (_, data) => taskManager.createTask(data));
  ipcMain.handle(IPC_CHANNELS.TASK_UPDATE, (_, id: string, data) => { taskManager.updateTask(id, data); });
  ipcMain.handle(IPC_CHANNELS.TASK_DELETE, (_, id: string) => { taskManager.deleteTask(id); });
  ipcMain.handle(IPC_CHANNELS.TASK_MOVE, (_, id: string, status: string, order?: number) => {
    taskManager.moveTask(id, status as any, order);
  });
  ipcMain.handle(IPC_CHANNELS.TASK_AUTODECOMPOSE, async (_, projectId: string, goal: string) => {
    return taskManager.autoDecompose(projectId, goal);
  });

  // ===== 导出 =====
  ipcMain.handle(IPC_CHANNELS.EXPORT_MARKDOWN, (_, conversationId: string) => {
    const conversation = ConversationModel.findById(conversationId);
    const messages = MessageModel.findByConversation(conversationId);
    if (!conversation) return '';
    return ExportManager.markdown(conversation, messages);
  });

  ipcMain.handle(IPC_CHANNELS.EXPORT_TEXT, (_, conversationId: string) => {
    const conversation = ConversationModel.findById(conversationId);
    const messages = MessageModel.findByConversation(conversationId);
    if (!conversation) return '';
    return ExportManager.text(conversation, messages);
  });

  ipcMain.handle(IPC_CHANNELS.EXPORT_JSON, (_, conversationId: string) => {
    const conversation = ConversationModel.findById(conversationId);
    const messages = MessageModel.findByConversation(conversationId);
    if (!conversation) return '{}';
    return ExportManager.json(conversation, messages);
  });

  // ===== 设置 =====
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => getStore().get('settings'));
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_, settings: Partial<AppSettings>) => {
    const current = getStore().get('settings');
    getStore().set('settings', { ...current, ...settings });
  });

  // ===== 搜索 =====
  ipcMain.handle(IPC_CHANNELS.CONVERSATION_SEARCH, (_, query: string) => MessageModel.search(query));

  // ===== 日志 =====
  ipcMain.handle(IPC_CHANNELS.LOG_GET, () => getLogs());
  ipcMain.handle(IPC_CHANNELS.LOG_CLEAR, () => { clearLogs(); });

  // ===== 窗口控制 =====
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });
  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });
  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() ?? false;
  });
  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });

  log.info('IPC 处理器已注册');
}
