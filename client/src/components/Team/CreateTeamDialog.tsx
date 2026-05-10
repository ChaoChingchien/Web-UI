import React, { useState, useMemo } from 'react';
import type { AITeam, AITeamWithRoles, AIRole, AIProvider, TeamMode } from '@shared/types';

interface Props {
  roles: AIRole[];
  providers: AIProvider[];
  newTeam: { name: string; description: string; mode: TeamMode; roleIds: string[] };
  setNewTeam: (v: { name: string; description: string; mode: TeamMode; roleIds: string[] }) => void;
  roleProviders: Record<string, string[]>;
  setRoleProviders: (v: Record<string, string[]>) => void;
  roleInputMappings: Record<string, 'original' | 'previous' | 'all_previous'>;
  setRoleInputMappings: (v: Record<string, 'original' | 'previous' | 'all_previous'>) => void;
  onSave: () => void;
  onClose: () => void;
  /** 编辑模式：传入已有团队数据预填充 */
  editingTeam?: AITeamWithRoles | null;
}

// ===== 角色分类系统（与 RoleManager 共用） =====
const ROLE_CATEGORY_MAP: Record<string, string> = {
  role_programmer: 'dev', role_architect: 'dev', role_tester: 'dev',
  role_devops: 'dev', role_data_scientist: 'dev',
  role_frontend: 'dev', role_backend: 'dev', role_code_reviewer: 'dev',
  role_security: 'dev', role_algorithm: 'dev',
  role_game_dev: 'dev', role_embedded: 'dev', role_blockchain_dev: 'dev',
  role_ml_engineer: 'dev', role_prompt_engineer: 'dev', role_perf_engineer: 'dev',
  role_tech_writer: 'dev',
  role_pm: 'product', role_designer: 'product', role_manager: 'product', role_analyst: 'product',
  role_user_researcher: 'product', role_operations: 'product', role_growth: 'product',
  role_writer: 'content', role_creative: 'content', role_translator: 'content',
  role_marketing: 'content', role_researcher: 'content', role_reviewer: 'content',
  role_copywriter: 'content', role_editor: 'content',
  role_social_media: 'content', role_storyteller: 'content',
  role_poet: 'content', role_novelist: 'content', role_rapper: 'content',
  role_composer: 'content', role_art_instructor: 'content', role_calligrapher: 'content',
  role_photographer: 'content', role_film_critic: 'content', role_standup_comedian: 'content',
  role_mj_prompt: 'content', role_etymologist: 'content',
  role_lawyer: 'business', role_finance: 'business',
  role_sales: 'business', role_hr: 'business', role_strategist: 'business',
  role_customer_success: 'business', role_ba: 'business',
  role_tech_interviewer: 'business', role_behavioral_interviewer: 'business',
  role_resume_optimizer: 'business', role_investor: 'business', role_vc_pitch: 'business',
  role_negotiator: 'business', role_speechwriter: 'business', role_naming_expert: 'business',
  role_journalist: 'business', role_real_estate: 'business',
  role_teacher: 'academic', role_academic_mentor: 'academic', role_paper_writer: 'academic',
  role_literature: 'academic', role_science_writer: 'academic',
  role_doctor: 'life', role_psychologist: 'life', role_chef: 'life', role_fitness: 'life',
  role_travel: 'life', role_personal_finance: 'life',
  role_parenting: 'life', role_career_coach: 'life', role_assistant: 'life',
  role_nutritionist: 'life', role_sleep_coach: 'life', role_yoga_teacher: 'life',
  role_meditation_guide: 'life', role_relationship_coach: 'life', role_fashion_stylist: 'life',
  role_pet_behavior: 'life', role_home_organizer: 'life', role_plant_care: 'life',
  role_diy_crafter: 'life',
  role_linux_terminal: 'tools', role_js_console: 'tools', role_sql_master: 'tools',
  role_regex_expert: 'tools', role_git_expert: 'tools', role_docker_expert: 'tools',
  role_k8s_expert: 'tools', role_shell_expert: 'tools', role_emoji_translator: 'tools',
  role_mindmap_gen: 'tools', role_password_helper: 'tools', role_glossary_gen: 'tools',
  role_english_speaking: 'learn', role_english_grammar: 'learn', role_japanese_teacher: 'learn',
  role_mathematician: 'learn', role_physicist: 'learn', role_chemist: 'learn',
  role_biologist: 'learn', role_historian: 'learn', role_philosopher: 'learn',
  role_socratic_tutor: 'learn',
};

const CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: 'all', label: '全部', icon: '📋' },
  { key: 'dev', label: '研发', icon: '💻' },
  { key: 'product', label: '产品', icon: '📱' },
  { key: 'content', label: '内容', icon: '✍️' },
  { key: 'business', label: '商务', icon: '💼' },
  { key: 'academic', label: '学术', icon: '🎓' },
  { key: 'life', label: '生活', icon: '🏠' },
  { key: 'tools', label: '工具', icon: '🔧' },
  { key: 'learn', label: '学习', icon: '📚' },
];

function getRoleCategory(role: AIRole): string {
  if (role.is_custom) return 'custom';
  return ROLE_CATEGORY_MAP[role.id] || 'business';
}

export const CreateTeamDialog: React.FC<Props> = ({
  roles, providers, newTeam, setNewTeam,
  roleProviders, setRoleProviders,
  roleInputMappings, setRoleInputMappings,
  onSave, onClose, editingTeam,
}) => {
  const isEditing = !!editingTeam;
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 过滤 + 搜索角色
  const filteredRoles = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    let base = roles;
    if (filterCategory !== 'all') {
      base = roles.filter((r) => getRoleCategory(r) === filterCategory);
    }
    if (!kw) return base;
    return base.filter((r) =>
      r.name.toLowerCase().includes(kw) ||
      (r.system_prompt || '').toLowerCase().includes(kw)
    );
  }, [roles, filterCategory, searchKeyword]);

  // 分类计数
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: roles.length };
    for (const role of roles) {
      const cat = getRoleCategory(role);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [roles]);

  const selectedRoles = roles.filter((r) => newTeam.roleIds.includes(r.id));

  const handleRoleToggle = (roleId: string) => {
    const checked = newTeam.roleIds.includes(roleId);
    if (checked) {
      setNewTeam({ ...newTeam, roleIds: newTeam.roleIds.filter((id) => id !== roleId) });
    } else {
      setNewTeam({ ...newTeam, roleIds: [...newTeam.roleIds, roleId] });
      // 首次选中：若角色绑了默认 provider 就预选
      const role = roles.find((r) => r.id === roleId);
      if (!roleProviders[roleId]) {
        const defaults = role?.provider_id ? [role.provider_id] : [];
        setRoleProviders({ ...roleProviders, [roleId]: defaults });
      }
    }
  };

  const handleProviderToggle = (roleId: string, providerId: string) => {
    const current = roleProviders[roleId] || [];
    const next = current.includes(providerId)
      ? current.filter((id) => id !== providerId)
      : [...current, providerId];
    setRoleProviders({ ...roleProviders, [roleId]: next });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal ct-modal"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <h3 className="ct-title">{isEditing ? '编辑 AI Team' : '创建 AI Team'}</h3>

        {/* 基本信息 */}
        <div className="ct-form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label>Team 名称</label>
            <input
              className="input"
              value={newTeam.name}
              onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
              placeholder="如：内容创作团队"
            />
          </div>
          <div className="form-group">
            <label>协作模式</label>
            <select
              className="input"
              style={{ minWidth: 160 }}
              value={newTeam.mode}
              onChange={(e) => setNewTeam({ ...newTeam, mode: e.target.value as TeamMode })}
            >
              <option value="pipeline">流水线</option>
              <option value="parallel">并行</option>
              <option value="debate">辩论</option>
              <option value="mixed">混合</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>描述</label>
          <input
            className="input"
            value={newTeam.description}
            onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
            placeholder="简要描述这个团队的用途"
          />
        </div>

        {/* 已选角色条 */}
        {selectedRoles.length > 0 && (
          <div className="ct-selected-bar">
            <span className="ct-selected-label">已选 {selectedRoles.length} 个角色：</span>
            <div className="ct-selected-chips">
              {selectedRoles.map((role) => (
                <span key={role.id} className="ct-selected-chip" onClick={() => handleRoleToggle(role.id)}>
                  {role.icon} {role.name} <span className="ct-chip-remove">×</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 搜索 + 分类标签 */}
        <div className="ct-toolbar">
          <div className="ct-search">
            <span className="ct-search-icon">🔍</span>
            <input
              type="text"
              placeholder="搜索角色…"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="ct-search-input"
            />
            {searchKeyword && (
              <button className="ct-search-clear" onClick={() => setSearchKeyword('')}>×</button>
            )}
          </div>
          <div className="ct-categories">
            {CATEGORIES.map((cat) => {
              const count = categoryCounts[cat.key];
              if (cat.key !== 'all' && (!count || count === 0)) return null;
              const active = filterCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  className={`ct-cat-chip ${active ? 'active' : ''}`}
                  onClick={() => setFilterCategory(cat.key)}
                >
                  {cat.icon} {cat.label}
                  {count !== undefined && <span className="ct-cat-count">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* 角色网格 */}
        <div className="ct-role-grid">
          {filteredRoles.length === 0 ? (
            <div className="ct-empty">没有匹配的角色</div>
          ) : (
            filteredRoles.map((role) => {
              const checked = newTeam.roleIds.includes(role.id);
              const cat = getRoleCategory(role);
              return (
                <div
                  key={role.id}
                  className={`ct-role-card ${checked ? 'selected' : ''} ct-card-${cat}`}
                  onClick={() => handleRoleToggle(role.id)}
                >
                  <div className="ct-role-icon">{role.icon || '🤖'}</div>
                  <div className="ct-role-name">{role.name}</div>
                  <div className={`ct-role-cat-tag ct-cat-${cat}`}>{cat}</div>
                  {checked && <div className="ct-role-check">✓</div>}
                </div>
              );
            })
          )}
        </div>

        {/* 已选角色详情（模型 + 输入映射） */}
        {selectedRoles.length > 0 && (
          <div className="ct-details-section">
            <div className="ct-details-title">已选角色配置</div>
            {selectedRoles.map((role) => {
              const mapping = roleInputMappings[role.id] || (newTeam.mode === 'pipeline' ? 'previous' : 'original');
              const selectedProviders = roleProviders[role.id] || [];
              return (
                <div key={role.id} className="ct-detail-row">
                  <div className="ct-detail-role-name">{role.icon} {role.name}</div>
                  <div className="ct-detail-controls">
                    {/* 模型选择 */}
                    <div className="ct-provider-chips">
                      {providers.filter((p) => p.is_enabled).map((p) => {
                        const active = selectedProviders.includes(p.id);
                        const modelLabel = p.api_config?.model || p.local_config?.model || p.name;
                        return (
                          <span
                            key={p.id}
                            className={`ct-provider-chip ${active ? 'active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); handleProviderToggle(role.id, p.id); }}
                            title={modelLabel}
                          >
                            {p.icon} {p.name}
                          </span>
                        );
                      })}
                      {/* 角色默认 */}
                      {role.provider_id && (
                        <span
                          className={`ct-provider-chip ${selectedProviders.includes(role.provider_id) ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleProviderToggle(role.id, role.provider_id); }}
                          title="跟随角色默认配置"
                        >
                          📋 默认
                        </span>
                      )}
                    </div>
                    {/* 输入映射 */}
                    <select
                      className="ct-mapping-select"
                      value={mapping}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        setRoleInputMappings({ ...roleInputMappings, [role.id]: e.target.value as 'original' | 'previous' | 'all_previous' });
                      }}
                    >
                      <option value="original">只看原始输入</option>
                      <option value="previous">看上一角色</option>
                      <option value="all_previous">看所有前面角色</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="form-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button
            className="btn btn-primary"
            onClick={onSave}
            disabled={!newTeam.name || newTeam.roleIds.length < 2}
          >
            {isEditing ? '保存更改' : `创建 Team`} ({newTeam.roleIds.length} 角色)
          </button>
        </div>
      </div>
    </div>
  );
};