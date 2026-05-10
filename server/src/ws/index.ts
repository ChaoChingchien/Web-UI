import { type WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { ProviderModel, ConversationModel, MessageModel, TeamModel, TeamChatModel, RoleModel } from '../database/models';
import type { TeamChatMessageData } from '@shared/types';
import { AIRouter } from '../ai/AIRouter';
import { Dispatcher } from '../ai/Dispatcher';
import { log } from '../platform';

/** 连接池 */
const clients = new Set<WebSocket>();
const aiRouter = new AIRouter();
const dispatcher = new Dispatcher();

/** 向所有连接的客户端广播消息 */
export function broadcast(type: string, data: unknown): void {
  const message = JSON.stringify({ type, data });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

/** 设置 WebSocket 服务器 */
export function setupWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    clients.add(ws);
    log.info(`WebSocket 客户端已连接 (当前 ${clients.size} 个连接)`);

    ws.on('message', (raw: Buffer) => {
      try {
        const { type, data } = JSON.parse(raw.toString());

        switch (type) {
          case 'chat:send':
            handleChatSend(ws, data);
            break;
          case 'team:chat:send':
            handleTeamChatSend(ws, data);
            break;
          default:
            log.warn(`未知的 WS 消息类型: ${type}`);
        }
      } catch (err) {
        log.error('WS 消息解析失败:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      log.info(`WebSocket 客户端已断开 (剩余 ${clients.size} 个连接)`);
    });

    ws.on('error', (err) => {
      log.error('WebSocket 错误:', err);
      clients.delete(ws);
    });
  });

  log.info('WebSocket 处理器已初始化');
}

/** 处理聊天发送（流式） */
async function handleChatSend(ws: WebSocket, data: { providerId: string; conversationId: string; message: string; mode?: string; model?: string; toggles?: Record<string, boolean> }): Promise<void> {
  const { providerId, conversationId, message, mode, model, toggles } = data;

  try {
    const provider = ProviderModel.findById(providerId);
    if (!provider) {
      sendWsError(ws, 'chat:error', { requestId: conversationId, type: 'provider_not_found', message: 'AI 提供商不存在', isRetryable: false });
      return;
    }

    // 检查 conversation 是否存在
    let conversation = ConversationModel.findById(conversationId);
    if (!conversation) {
      // 自动创建对话
      conversation = ConversationModel.create(providerId, message.substring(0, 50) || '新对话');
    }

    // 1. 保存用户消息
    MessageModel.create(conversationId, 'user', message);

    // === 自动调度 ===
    let dispatchedRole: { id: string; name: string; icon: string; reason: string } | undefined;
    let effectiveSystemPrompt: string | undefined;

    if (conversation.auto_dispatch) {
      try {
        const roles = RoleModel.findAll();
        const recent = MessageModel.findByConversation(conversationId)
          .slice(-6)
          .map((m) => ({ role: m.role, content: m.content }));
        const decision = await dispatcher.dispatch(message, roles, recent);
        if (decision) {
          const role = RoleModel.findById(decision.roleId);
          if (role) {
            dispatchedRole = { id: role.id, name: role.name, icon: role.icon, reason: decision.reason };
            effectiveSystemPrompt = role.system_prompt;
          }
        }
      } catch (err) {
        log.warn('[chat:send] 自动调度失败，继续使用默认行为:', err);
      }
    }

    // 2. 获取历史消息
    const history = MessageModel.findByConversation(conversationId);
    const historyMessages = history.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));
    const messages = effectiveSystemPrompt
      ? [
          { role: 'system' as const, content: effectiveSystemPrompt },
          ...historyMessages,
        ]
      : historyMessages;

    // 3. 流式调用 AI
    let fullResponse = '';
    const knownWebUrl = conversation.web_url;

    await aiRouter.chatStream(
      provider,
      messages,
      { mode, model, toggles, conversationId, webUrl: knownWebUrl },
      // onChunk
      (chunk: string) => {
        fullResponse += chunk;
        sendWsMessage(ws, 'chat:stream', { conversationId, chunk });
      },
      // onDone
      (meta) => {
        // 4. 保存助手消息
        const savedMessage = MessageModel.create(
          conversationId,
          'assistant',
          fullResponse,
          dispatchedRole
            ? { dispatchedRoleId: dispatchedRole.id, dispatchReason: dispatchedRole.reason }
            : undefined
        );
        ConversationModel.touch(conversationId);
        // 若 web provider 返回了真实对话 URL，持久化（用于下次恢复）
        if (meta?.finalUrl && provider.type === 'web' && meta.finalUrl !== knownWebUrl) {
          try { ConversationModel.updateWebUrl(conversationId, meta.finalUrl); }
          catch (err) { log.warn(`[chat] 更新 web_url 失败:`, err); }
        }
        autoNameConversation(conversationId, message);
        sendWsMessage(ws, 'chat:complete', {
          conversationId,
          messageId: savedMessage.id,
          ...(dispatchedRole ? { dispatchedRole } : {}),
        });
      },
      // onError
      (err: Error) => {
        log.error(`[chat:stream] ${err.message}`);
        if (fullResponse) {
          MessageModel.create(conversationId, 'assistant', fullResponse);
          ConversationModel.touch(conversationId);
        }
        sendWsError(ws, 'chat:error', {
          requestId: conversationId,
          type: 'stream_error',
          message: err.message,
          isRetryable: true,
          partialContent: fullResponse || undefined,
        });
      }
    );
  } catch (err) {
    log.error(`[chat:send] 处理失败:`, err);
    sendWsError(ws, 'chat:error', {
      requestId: conversationId,
      type: 'internal_error',
      message: err instanceof Error ? err.message : String(err),
      isRetryable: true,
    });
  }
}

/** 处理 Team 群聊发送（流式，每角色独立输出） */
async function handleTeamChatSend(ws: WebSocket, data: { teamId: string; message: string }): Promise<void> {
  const { teamId, message } = data;

  try {
    const team = TeamModel.findById(teamId);
    if (!team) {
      sendWsMessage(ws, 'team:chat:error', { type: 'team_not_found', message: 'Team 不存在' });
      return;
    }

    const sortedRoles = [...team.roles].sort((a, b) => a.role_order - b.role_order);
    if (sortedRoles.length === 0) {
      sendWsMessage(ws, 'team:chat:error', { type: 'no_roles', message: 'Team 没有角色成员' });
      return;
    }

    // 保存用户消息并广播
    const userMsg = TeamChatModel.create({ team_id: teamId, role: 'user', content: message });
    broadcast('team:chat:message', userMsg);

    // 并行模式：所有角色同时执行
    if (team.mode === 'parallel') {
      await runTeamChatParallel(ws, teamId, message, sortedRoles);
    } else {
      // pipeline / debate / mixed：按顺序执行
      await runTeamChatSequential(ws, teamId, message, sortedRoles, team.mode);
    }

    broadcast('team:chat:turn:complete', { teamId });
  } catch (err) {
    log.error('[team:chat:send] 处理失败:', err);
    sendWsMessage(ws, 'team:chat:error', {
      type: 'internal_error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/** 并行执行所有角色 */
async function runTeamChatParallel(
  ws: WebSocket, teamId: string, userMessage: string,
  roles: { role: { id: string; name: string; icon: string; system_prompt: string; provider_id: string; config: { temperature: number; max_tokens: number } }; provider_overrides?: string[]; conversation_id?: string }[]
): Promise<void> {
  await Promise.all(roles.map((tr) =>
    executeTeamChatRole(ws, teamId, tr, userMessage)
  ));
}

/** 按顺序执行所有角色 */
async function runTeamChatSequential(
  ws: WebSocket, teamId: string, userMessage: string,
  roles: { role: { id: string; name: string; icon: string; system_prompt: string; provider_id: string; config: { temperature: number; max_tokens: number } }; provider_overrides?: string[]; conversation_id?: string }[],
  mode: string
): Promise<void> {
  const allOutputs: { roleName: string; content: string }[] = [];
  for (const tr of roles) {
    // 构建输入：pipeline 模式下当前角色看到之前所有角色的输出
    let input = userMessage;
    if ((mode === 'pipeline' || mode === 'debate') && allOutputs.length > 0) {
      const context = allOutputs.map(o => `【${o.roleName}】\n${o.content}`).join('\n\n');
      input = `用户消息: ${userMessage}\n\n之前的回复:\n${context}`;
    }

    const output = await executeTeamChatRole(ws, teamId, tr, input);
    allOutputs.push({ roleName: tr.role.name, content: output });
  }
}

/** 执行单个角色的 AI 调用并流式输出 */
async function executeTeamChatRole(
  ws: WebSocket, teamId: string,
  teamRole: { role: { id: string; name: string; icon: string; system_prompt: string; provider_id: string; config: { temperature: number; max_tokens: number } }; provider_overrides?: string[]; conversation_id?: string },
  input: string
): Promise<string> {
  const role = teamRole.role;
  // 优先使用 team_role 的 provider_overrides 第一个，其次使用角色默认的 provider_id
  const providerId = (teamRole.provider_overrides && teamRole.provider_overrides.length > 0)
    ? teamRole.provider_overrides[0]
    : role.provider_id;
  const provider = ProviderModel.findById(providerId);
  if (!provider) {
    // 找不到提供商 — 创建一条错误消息
    const errMsg = TeamChatModel.create({
      team_id: teamId, role_id: role.id, role_name: role.name, role_icon: role.icon,
      role: 'assistant', content: `❌ 提供商不存在`, status: 'error',
    });
    broadcast('team:chat:message', errMsg);
    return '';
  }

  // 创建流式消息记录
  const msg = TeamChatModel.create({
    team_id: teamId, role_id: role.id, role_name: role.name, role_icon: role.icon,
    role: 'assistant', status: 'streaming',
  });
  broadcast('team:chat:message', msg);

  // 加载该角色绑定的固定对话历史（如果有）
  const conversationId = teamRole.conversation_id;
  const history: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  let knownWebUrl: string | undefined;
  if (conversationId) {
    try {
      const conv = ConversationModel.findById(conversationId);
      knownWebUrl = conv?.web_url;
      const past = MessageModel.findByConversation(conversationId);
      for (const m of past) {
        history.push({ role: m.role as 'system' | 'user' | 'assistant', content: m.content });
      }
      // 将当前用户输入持久化到对话
      MessageModel.create(conversationId, 'user', input);
    } catch (err) {
      log.error(`[team:chat] 加载角色固定对话失败:`, err);
    }
  }

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: role.system_prompt },
    ...history,
    { role: 'user', content: input },
  ];

  let fullContent = '';
  const msgId = msg.id;

  return new Promise<string>((resolve) => {
    aiRouter.chatStream(
      provider,
      messages,
      { conversationId, webUrl: knownWebUrl },
      // onChunk — 广播每个块
      (chunk: string) => {
        fullContent += chunk;
        broadcast('team:chat:chunk', { messageId: msgId, teamId, roleId: role.id, roleName: role.name, chunk });
      },
      // onDone — 标记完成
      (meta) => {
        TeamChatModel.update(msgId, { content: fullContent, status: 'done' });
        // 持久化助手回复到固定对话
        if (conversationId) {
          try {
            MessageModel.create(conversationId, 'assistant', fullContent);
            ConversationModel.touch(conversationId);
            // 同步网页端对话 URL（web 类型 provider）
            if (meta?.finalUrl && provider.type === 'web' && meta.finalUrl !== knownWebUrl) {
              ConversationModel.updateWebUrl(conversationId, meta.finalUrl);
            }
          } catch (err) {
            log.error(`[team:chat] 保存角色回复到固定对话失败:`, err);
          }
        }
        broadcast('team:chat:done', { messageId: msgId, teamId, roleId: role.id, roleName: role.name, content: fullContent });
        resolve(fullContent);
      },
      // onError
      (err: Error) => {
        TeamChatModel.update(msgId, { content: fullContent || `错误: ${err.message}`, status: 'error' });
        // 即使出错，也把已生成的内容保存到固定对话（保持上下文连贯）
        if (conversationId && fullContent) {
          try {
            MessageModel.create(conversationId, 'assistant', fullContent);
            ConversationModel.touch(conversationId);
          } catch (innerErr) {
            log.error(`[team:chat] 保存部分回复失败:`, innerErr);
          }
        }
        broadcast('team:chat:done', { messageId: msgId, teamId, roleId: role.id, roleName: role.name, content: fullContent || '' });
        resolve(fullContent || '');
      }
    );
  });
}

/** 向指定客户端发送消息 */
function sendWsMessage(ws: WebSocket, type: string, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type, data }));
    } catch {
      // Stale connection
    }
  }
}


/** 向指定客户端发送错误 */
function sendWsError(ws: WebSocket, type: string, data: { requestId: string; type: string; message: string; isRetryable: boolean; partialContent?: string }): void {
  sendWsMessage(ws, type, data);
}

/** 自动命名对话（首次回复后用用户消息截取标题） */
function autoNameConversation(conversationId: string, firstMessage: string): void {
  try {
    const conv = ConversationModel.findById(conversationId);
    if (!conv || conv.title !== '新对话') return;
    const title = firstMessage.length > 30 ? firstMessage.substring(0, 30) + '...' : firstMessage;
    ConversationModel.updateTitle(conversationId, title);
  } catch (err) {
    log.error('[autoName] 自动命名失败:', err);
  }
}
