import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { AITeamWithRoles, AIRole, AIProvider, TeamMode, TeamChatMessageData } from '@shared/types';
import { useToast } from '../Toast';
import { CreateTeamDialog } from './CreateTeamDialog';
import './TeamView.css';

interface PresetTemplate {
  name: string;
  description: string;
  mode: TeamMode;
  roleNames: string[];
  category: string;
}

const CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: 'all', label: '全部', icon: '📋' },
  { key: 'dev', label: '开发', icon: '💻' },
  { key: 'product', label: '产品', icon: '📱' },
  { key: 'life', label: '生活', icon: '🏠' },
  { key: 'business', label: '专业', icon: '💼' },
];

const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    name: '产品评审会',
    description: '多角色从不同角度评审产品方案，汇总改进建议',
    mode: 'debate',
    roleNames: ['项目经理', '研究员', '分析师', '审核员', '创意师'],
    category: 'product',
  },
  {
    name: '写作工作流',
    description: '研究 → 撰写 → 审核，流水线式内容生产',
    mode: 'pipeline',
    roleNames: ['研究员', '写手', '审核员'],
    category: 'business',
  },
  {
    name: '代码审查',
    description: '程序员编写 + 审核员审查，保障代码质量',
    mode: 'pipeline',
    roleNames: ['程序员', '审核员'],
    category: 'dev',
  },
  {
    name: '头脑风暴',
    description: '多角色并行发散思考，最后由分析师汇总',
    mode: 'parallel',
    roleNames: ['创意师', '研究员', '分析师', '写手'],
    category: 'product',
  },
  {
    name: '技术方案决策',
    description: '程序员提方案，多方辩论，项目经理汇总决策',
    mode: 'debate',
    roleNames: ['程序员', '审核员', '分析师', '项目经理'],
    category: 'dev',
  },
  {
    name: '全栈项目开发',
    description: '产品经理 → 架构师 → 程序员 → 测试工程师 → DevOps，全流程开发',
    mode: 'pipeline',
    roleNames: ['产品经理', '架构师', '程序员', '测试工程师', 'DevOps工程师'],
    category: 'dev',
  },
  {
    name: '前端开发',
    description: '设计师出UI方案 → 程序员编码实现 → 审核员审查代码',
    mode: 'pipeline',
    roleNames: ['设计师', '程序员', '审核员'],
    category: 'dev',
  },
  {
    name: 'API 后端开发',
    description: '架构师定技术方案 → 程序员实现接口 → 测试工程师验证',
    mode: 'pipeline',
    roleNames: ['架构师', '程序员', '测试工程师'],
    category: 'dev',
  },
  {
    name: 'Bug 修复流程',
    description: '测试工程师发现问题 → 程序员定位修复 → 审核员复查确认',
    mode: 'pipeline',
    roleNames: ['测试工程师', '程序员', '审核员'],
    category: 'dev',
  },
  {
    name: '产品设计讨论',
    description: '产品经理 + 设计师 + 分析师 + 研究员，多方讨论产品方案',
    mode: 'debate',
    roleNames: ['产品经理', '设计师', '分析师', '研究员'],
    category: 'product',
  },
  {
    name: '旅行规划',
    description: '多地调研、预算分析、行程撰写，一站式旅行规划',
    mode: 'parallel',
    roleNames: ['研究员', '分析师', '写手'],
    category: 'life',
  },
  {
    name: '美食推荐',
    description: '菜系调研 + 营养分析 + 创意食谱，全方位美食顾问',
    mode: 'parallel',
    roleNames: ['研究员', '分析师', '创意师'],
    category: 'life',
  },
  {
    name: '学习辅导',
    description: '研究员搜集资料 → 分析师提炼重点 → 写手整理笔记',
    mode: 'pipeline',
    roleNames: ['研究员', '分析师', '写手'],
    category: 'life',
  },
  {
    name: '市场调研',
    description: '调研市场动态 → 分析数据趋势 → 撰写调研报告',
    mode: 'pipeline',
    roleNames: ['研究员', '分析师', '写手'],
    category: 'business',
  },
  {
    name: '商业计划书',
    description: '研究市场 → 分析可行性 → 规划项目 → 撰写计划书',
    mode: 'pipeline',
    roleNames: ['研究员', '分析师', '项目经理', '写手'],
    category: 'business',
  },
  {
    name: '法律合同审查',
    description: '法律顾问审查合同条文 → 审核员复核格式 → 写手输出意见书',
    mode: 'pipeline',
    roleNames: ['法律顾问', '审核员', '写手'],
    category: 'business',
  },
  {
    name: '健康管理咨询',
    description: '医学顾问分析健康数据 + 健身教练制定运动计划 + 美食顾问设计饮食方案',
    mode: 'parallel',
    roleNames: ['医学顾问', '健身教练', '美食顾问'],
    category: 'life',
  },
  {
    name: '课程教学设计',
    description: '教育专家设计课程 → 研究员搜集素材 → 写手编写教材 → 审核员审校',
    mode: 'pipeline',
    roleNames: ['教育专家', '研究员', '写手', '审核员'],
    category: 'business',
  },
  {
    name: '财务规划分析',
    description: '财务顾问分析状况 + 分析师数据建模 + 项目经理制定执行计划',
    mode: 'pipeline',
    roleNames: ['财务顾问', '分析师', '项目经理'],
    category: 'business',
  },
  {
    name: '品牌营销策划',
    description: '营销专家制定策略 + 创意师构思内容 + 设计师制作方案 + 分析师评估效果',
    mode: 'pipeline',
    roleNames: ['营销专家', '创意师', '设计师', '分析师'],
    category: 'business',
  },
  {
    name: '数据科学项目',
    description: '数据科学家建模 + 程序员实现 → 分析师验证 → 写手输出报告',
    mode: 'pipeline',
    roleNames: ['数据科学家', '程序员', '分析师', '写手'],
    category: 'dev',
  },
  {
    name: '心理疏导陪伴',
    description: '心理咨询师倾听引导 + 创意师提供放松活动建议 + 写手整理记录',
    mode: 'parallel',
    roleNames: ['心理咨询师', '创意师', '写手'],
    category: 'life',
  },
  {
    name: '健身计划定制',
    description: '健身教练设计训练方案 + 美食顾问搭配营养餐 + 医学顾问把关安全',
    mode: 'parallel',
    roleNames: ['健身教练', '美食顾问', '医学顾问'],
    category: 'life',
  },
  {
    name: '多语言内容创作',
    description: '研究员搜集素材 → 写手撰写原文 → 翻译官多语翻译 → 审核员校对',
    mode: 'pipeline',
    roleNames: ['研究员', '写手', '翻译官', '审核员'],
    category: 'business',
  },
  {
    name: '创业项目评估',
    description: '产品经理 + 财务顾问 + 法律顾问 + 营销专家 + 分析师多角度评估',
    mode: 'debate',
    roleNames: ['产品经理', '财务顾问', '法律顾问', '营销专家', '分析师'],
    category: 'business',
  },
];

export const TeamView: React.FC = () => {
  const [teams, setTeams] = useState<AITeamWithRoles[]>([]);
  const [roles, setRoles] = useState<AIRole[]>([]);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');

  // Chat state
  const [messages, setMessages] = useState<TeamChatMessageData[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const [newTeam, setNewTeam] = useState({ name: '', description: '', mode: 'pipeline' as TeamMode, roleIds: [] as string[] });
  const [roleInputMappings, setRoleInputMappings] = useState<Record<string, 'original' | 'previous' | 'all_previous'>>({});
  const [roleProviders, setRoleProviders] = useState<Record<string, string[]>>({});

  // 流式消息缓存：messageId → 当前内容
  const streamingRef = useRef<Map<string, string>>(new Map());

  const loadData = useCallback(async () => {
    setTeamLoading(true);
    setLoadError(null);
    try {
      const [t, r, p] = await Promise.all([window.api.team.list(), window.api.role.list(), window.api.provider.list()]);
      setTeams(t);
      setRoles(r);
      setProviders(p);
    } catch (err) {
      console.error('加载 Team 数据失败:', err);
      setLoadError('加载数据失败，请刷新重试');
    } finally {
      setTeamLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // 加载聊天历史
  const loadChatHistory = useCallback(async (teamId: string) => {
    try {
      const history = await window.api.team.chat.history(teamId);
      setMessages(history);
    } catch (err) {
      console.error('加载聊天历史失败:', err);
    }
  }, []);

  // 选中团队时加载聊天历史
  useEffect(() => {
    if (selectedTeam) {
      loadChatHistory(selectedTeam);
    } else {
      setMessages([]);
    }
  }, [selectedTeam, loadChatHistory]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // WebSocket 事件监听
  useEffect(() => {
    const unsubMessage = window.api.team.chat.onMessage((msg) => {
      setMessages((prev) => {
        // 如果消息已存在（更新 status），替换它；否则追加
        const idx = prev.findIndex((m) => m.id === msg.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = msg;
          return next;
        }
        return [...prev, msg];
      });
    });

    const unsubChunk = window.api.team.chat.onChunk(({ messageId, chunk }) => {
      // 累积流式内容到 ref，然后更新 messages
      const prev = streamingRef.current.get(messageId) || '';
      const updated = prev + chunk;
      streamingRef.current.set(messageId, updated);
      setMessages((prevMsgs) =>
        prevMsgs.map((m) =>
          m.id === messageId ? { ...m, content: updated } : m
        )
      );
    });

    const unsubDone = window.api.team.chat.onDone(({ messageId, content }) => {
      streamingRef.current.delete(messageId);
      setMessages((prevMsgs) =>
        prevMsgs.map((m) =>
          m.id === messageId ? { ...m, content, status: 'done' } : m
        )
      );
    });

    const unsubTurn = window.api.team.chat.onTurnComplete(() => {
      setSending(false);
    });

    const unsubError = window.api.team.chat.onError((data) => {
      toast('error', `Team 聊天错误: ${data.message}`);
      setSending(false);
    });

    return () => {
      unsubMessage();
      unsubChunk();
      unsubDone();
      unsubTurn();
      unsubError();
    };
  }, [toast]);

  const handleCreatePreset = useCallback(async (template: PresetTemplate) => {
    const matchingRoles = template.roleNames
      .map((name) => roles.find((r) => r.name === name))
      .filter(Boolean) as AIRole[];

    if (matchingRoles.length < 2) return;

    const roleEntries = matchingRoles.map((role, i) => ({
      roleId: role.id,
      order: i,
      parallelGroup: template.mode === 'parallel' ? 0 : i,
      inputMapping: template.mode === 'pipeline' ? 'previous' as const : 'original' as const,
    }));

    try {
      await window.api.team.create({
        name: template.name,
        description: template.description,
        mode: template.mode,
        roleIds: roleEntries,
      });
      toast('success', `团队「${template.name}」已创建`);
      loadData();
    } catch (err) {
      toast('error', '创建预设团队失败');
    }
  }, [roles, loadData, toast]);

  const handleCreateTeam = useCallback(async () => {
    const roleEntries = newTeam.roleIds.map((roleId, i) => ({
      roleId,
      order: i,
      parallelGroup: newTeam.mode === 'parallel' ? 0 : i,
      inputMapping: roleInputMappings[roleId] || (newTeam.mode === 'pipeline' ? 'previous' : 'original'),
      providerIds: roleProviders[roleId] || [],
    }));

    try {
      await window.api.team.create({
        name: newTeam.name,
        description: newTeam.description,
        mode: newTeam.mode,
        roleIds: roleEntries,
      });
      setShowCreate(false);
      setNewTeam({ name: '', description: '', mode: 'pipeline', roleIds: [] });
      setRoleInputMappings({});
      setRoleProviders({});
      toast('success', '团队已创建');
      loadData();
    } catch (err) {
      toast('error', '创建团队失败');
    }
  }, [newTeam, roleInputMappings, roleProviders, loadData, toast]);

  const handleSendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !selectedTeam || sending) return;
    setInput('');
    setSending(true);
    window.api.team.chat.send(selectedTeam, trimmed);
  }, [input, selectedTeam, sending]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const handleDeleteTeam = useCallback(async () => {
    if (!selectedTeam) return;
    try {
      await window.api.team.delete(selectedTeam);
      setSelectedTeam(null);
      setShowDeleteConfirm(false);
      setMessages([]);
      loadData();
      toast('success', '团队已删除');
    } catch (err) {
      toast('error', '删除团队失败');
    }
  }, [selectedTeam, loadData, toast]);

  const selectedTeamData = useMemo(
    () => teams.find((t) => t.id === selectedTeam) as AITeamWithRoles | undefined,
    [teams, selectedTeam]
  );

  // 输入框自动调整高度
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, []);

  return (
    <div className="team-view">
      <div className="team-sidebar">
        <div className="team-sidebar-header">
          <h3>AI Teams</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ 新建</button>
        </div>
        <div className="team-list">
          {teamLoading && teams.length === 0 && <div className="empty-state">加载中...</div>}
          {loadError && <div className="empty-state" style={{ color: 'var(--danger)' }}>{loadError}</div>}
          {!teamLoading && !loadError && teams.map((team) => (
            <div
              key={team.id}
              className={`team-item ${selectedTeam === team.id ? 'active' : ''}`}
              onClick={() => setSelectedTeam(team.id)}
            >
              <span className="team-name">{team.name}</span>
              <span className={`team-mode mode-${team.mode}`}>{team.mode}</span>
            </div>
          ))}
          {!teamLoading && !loadError && teams.length === 0 && <div className="empty-state">暂无 Team</div>}
        </div>
      </div>

      <div className="team-content">
        {!selectedTeamData ? (
          <div className="team-empty">
            <h2>选择一个 AI Team</h2>
            <p>或从预设模板一键创建</p>
            <div className="preset-templates">
              <div className="preset-templates-header">
                <h4>预设团队模板</h4>
                <div className="category-filters">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.key}
                      className={`category-chip ${filterCategory === cat.key ? 'active' : ''}`}
                      onClick={() => setFilterCategory(cat.key)}
                    >
                      {cat.icon} {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="preset-grid">
                {PRESET_TEMPLATES.filter((t) => filterCategory === 'all' || t.category === filterCategory).map((tpl, i) => (
                  <div key={i} className={`card preset-card preset-card-${tpl.category}`}>
                    <div className="preset-card-header">
                      <strong>{tpl.name}</strong>
                      <span className={`team-mode-badge mode-${tpl.mode}`}>{tpl.mode}</span>
                    </div>
                    <p className="preset-desc">{tpl.description}</p>
                    <div className="preset-roles">
                      {tpl.roleNames.map((rn, j) => (
                        <span key={j} className="role-chip">{rn}</span>
                      ))}
                    </div>
                    <button
                      className="btn btn-primary btn-sm preset-card-btn"
                      onClick={() => handleCreatePreset(tpl)}
                    >
                      一键创建
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* 团队信息头 */}
            <div className="team-chat-header">
              <div className="team-chat-info">
                <h2>{selectedTeamData.name}</h2>
                <span className={`team-mode-badge mode-${selectedTeamData.mode}`}>{selectedTeamData.mode}</span>
                <span className="team-member-count">{selectedTeamData.roles?.length || 0} 个角色</span>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => setShowDeleteConfirm(true)}>删除</button>
            </div>

            {/* 角色成员提示条 */}
            <div className="team-roles-bar">
              {selectedTeamData.roles?.map((tr) => {
                const overrides = tr.provider_overrides || [];
                const effectiveProviderId = overrides.length > 0 ? overrides[0] : tr.role.provider_id;
                const provider = providers.find((p) => p.id === effectiveProviderId);
                const modelLabel = provider?.api_config?.model || provider?.local_config?.model || '';
                return (
                  <span key={tr.role_id} className="role-chip" title={`${tr.role.name}: ${provider?.name || '默认'} ${modelLabel}`}>
                    {tr.role.icon} {tr.role.name}
                    {modelLabel && <small style={{ marginLeft: 4, opacity: 0.6 }}>({modelLabel})</small>}
                  </span>
                );
              })}
            </div>

            {/* 聊天消息列表 */}
            <div className="team-chat-messages">
              {messages.length === 0 && (
                <div className="chat-empty-hint">
                  <p>群聊已就绪，发送消息后所有角色成员将参与回复</p>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`team-msg ${msg.role}`}>
                  <div className="team-msg-avatar">
                    {msg.role === 'user' ? '👤' : (msg.role_icon || '🤖')}
                  </div>
                  <div className="team-msg-body">
                    <div className="team-msg-meta">
                      <span className="team-msg-author">
                        {msg.role === 'user' ? '你' : (msg.role_name || 'AI')}
                      </span>
                      <span className="team-msg-time">
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </span>
                      {msg.status === 'streaming' && (
                        <span className="team-msg-streaming">正在输入...</span>
                      )}
                      {msg.status === 'error' && (
                        <span className="team-msg-error">发送失败</span>
                      )}
                    </div>
                    <div className="team-msg-text">
                      {msg.content || (msg.status === 'streaming' ? '...' : '')}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* 输入区 */}
            <div className="team-chat-input-area">
              <textarea
                className="chat-input"
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={`发送消息给 ${selectedTeamData.name} 的成员... (Enter 发送)`}
                rows={1}
                disabled={sending}
              />
              <button
                className="btn btn-primary send-btn"
                onClick={handleSendMessage}
                disabled={!input.trim() || sending}
              >
                {sending ? '发送中...' : '发送'}
              </button>
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <CreateTeamDialog
          roles={roles}
          providers={providers}
          newTeam={newTeam}
          setNewTeam={setNewTeam}
          roleProviders={roleProviders}
          setRoleProviders={setRoleProviders}
          roleInputMappings={roleInputMappings}
          setRoleInputMappings={setRoleInputMappings}
          onSave={handleCreateTeam}
          onClose={() => setShowCreate(false)}
        />
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" style={{ width: 360, padding: 24 }} onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowDeleteConfirm(false);
              if (e.key === 'Enter' && !e.shiftKey) handleDeleteTeam();
            }}
          >
            <h3>确认删除</h3>
            <p style={{ margin: '12px 0', color: 'var(--text-secondary)' }}>
              确定要删除 "{selectedTeamData?.name}" 吗？此操作不可撤销，所有聊天记录将被清空。
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowDeleteConfirm(false)}>取消</button>
              <button className="btn btn-danger" onClick={handleDeleteTeam}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
