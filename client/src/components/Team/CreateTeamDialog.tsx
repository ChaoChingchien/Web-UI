import React from 'react';
import type { AITeam, AIRole, AIProvider, TeamMode } from '@shared/types';

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
}

export const CreateTeamDialog: React.FC<Props> = ({
  roles, providers, newTeam, setNewTeam,
  roleProviders, setRoleProviders,
  roleInputMappings, setRoleInputMappings,
  onSave, onClose,
}) => {
  const handleRoleCheck = (roleId: string, checked: boolean) => {
    if (checked) {
      setNewTeam({ ...newTeam, roleIds: [...newTeam.roleIds, roleId] });
      // 选中时：若角色绑了默认 provider 就预选，否则留空由用户自行选择
      const role = roles.find((r) => r.id === roleId);
      if (!roleProviders[roleId]) {
        const defaults = role?.provider_id ? [role.provider_id] : [];
        setRoleProviders({ ...roleProviders, [roleId]: defaults });
      }
    } else {
      setNewTeam({ ...newTeam, roleIds: newTeam.roleIds.filter((id) => id !== roleId) });
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
      <div className="modal" style={{ width: 640, padding: 24 }} onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter' && !e.shiftKey && newTeam.name && newTeam.roleIds.length >= 2) onSave();
        }}
      >
        <h3>创建 AI Team</h3>

        <div className="form-group">
          <label>Team 名称</label>
          <input
            className="input"
            value={newTeam.name}
            onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
            placeholder="如：内容创作团队"
          />
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

        <div className="form-group">
          <label>协作模式</label>
          <select
            className="input"
            value={newTeam.mode}
            onChange={(e) => setNewTeam({ ...newTeam, mode: e.target.value as TeamMode })}
          >
            <option value="pipeline">流水线 - 顺序执行</option>
            <option value="parallel">并行 - 同时执行</option>
            <option value="debate">讨论 - 多轮辩论</option>
            <option value="mixed">混合 - 自定义编排</option>
          </select>
        </div>

        <div className="form-group">
          <label>选择角色（按顺序）</label>
          <div className="role-selector">
            {roles.map((role) => {
              const checked = newTeam.roleIds.includes(role.id);
              return (
                <div key={role.id} className={`role-select-item ${checked ? 'expanded' : ''}`}>
                  <div className="role-select-header">
                    <label className="role-checkbox">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => handleRoleCheck(role.id, e.target.checked)}
                      />
                      <span>{role.icon} {role.name}</span>
                    </label>
                  </div>

                  {checked && (
                    <div className="role-select-details">
                      {/* 模型选择（多选） */}
                      <div className="role-providers-section">
                        <span className="role-detail-label">选择模型</span>
                        <div className="provider-checkboxes">
                          {providers
                            .filter((p) => p.is_enabled)
                            .map((p) => {
                              const selected = (roleProviders[role.id] || []).includes(p.id);
                              const modelLabel = p.api_config?.model || p.local_config?.model || p.name;
                              return (
                                <label
                                  key={p.id}
                                  className={`provider-checkbox ${selected ? 'checked' : ''}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => handleProviderToggle(role.id, p.id)}
                                  />
                                  <span className="provider-checkbox-label">
                                    {p.icon} {p.name}
                                    <small className="provider-checkbox-model">{modelLabel}</small>
                                  </span>
                                </label>
                              );
                            })}
                          {/* 角色默认选项（仅在角色确实绑定了默认 provider 时显示） */}
                          {role.provider_id && (
                            <label
                              className={`provider-checkbox ${(roleProviders[role.id] || []).includes(role.provider_id) ? 'checked' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={(roleProviders[role.id] || []).includes(role.provider_id)}
                                onChange={() => handleProviderToggle(role.id, role.provider_id)}
                              />
                              <span className="provider-checkbox-label">
                                📋 使用角色默认
                                <small className="provider-checkbox-model">跟随角色配置</small>
                              </span>
                            </label>
                          )}
                        </div>
                      </div>

                      {/* 输入映射 */}
                      <div className="role-mapping-section">
                        <span className="role-detail-label">输入映射</span>
                        <select
                          className="input-mapping-select"
                          value={roleInputMappings[role.id] || (newTeam.mode === 'pipeline' ? 'previous' : 'original')}
                          onChange={(e) => setRoleInputMappings({ ...roleInputMappings, [role.id]: e.target.value as 'original' | 'previous' | 'all_previous' })}
                        >
                          <option value="original">只看原始输入</option>
                          <option value="previous">看上一角色</option>
                          <option value="all_previous">看所有前面角色</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="form-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button
            className="btn btn-primary"
            onClick={onSave}
            disabled={!newTeam.name || newTeam.roleIds.length < 2}
          >
            创建 Team
          </button>
        </div>
      </div>
    </div>
  );
};
