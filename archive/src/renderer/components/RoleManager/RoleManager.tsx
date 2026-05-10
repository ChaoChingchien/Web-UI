import React, { useState, useEffect } from 'react';
import type { AIRole } from '@shared/types';
import './RoleManager.css';

const ICONS = ['🤖', '🔍', '✍️', '✅', '💻', '🎨', '📊', '🌐', '📋', '🧠', '🎯', '🔧', '📝', '💡', '🏗️', '🛡️'];

export const RoleManager: React.FC = () => {
  const [roles, setRoles] = useState<AIRole[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<AIRole | null>(null);
  const [form, setForm] = useState({
    name: '', icon: '🤖', system_prompt: '', provider_id: '',
    temperature: 0.7, max_tokens: 4096,
  });
  const [providers, setProviders] = useState<{ id: string; name: string; icon: string }[]>([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [r, p] = await Promise.all([window.api.role.list(), window.api.provider.list()]);
    setRoles(r);
    setProviders(p);
  };

  const openCreate = () => {
    setEditingRole(null);
    setForm({ name: '', icon: '🤖', system_prompt: '', provider_id: providers[0]?.id || '', temperature: 0.7, max_tokens: 4096 });
    setShowForm(true);
  };

  const openEdit = (role: AIRole) => {
    setEditingRole(role);
    setForm({
      name: role.name, icon: role.icon, system_prompt: role.system_prompt,
      provider_id: role.provider_id, temperature: role.config.temperature, max_tokens: role.config.max_tokens,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const data = {
      name: form.name.trim(), icon: form.icon, system_prompt: form.system_prompt,
      provider_id: form.provider_id,
      config: { temperature: form.temperature, max_tokens: form.max_tokens },
    };
    if (editingRole) {
      await window.api.role.update(editingRole.id, data);
    } else {
      await window.api.role.create(data);
    }
    setShowForm(false);
    loadData();
  };

  const handleDelete = async (role: AIRole) => {
    if (!confirm(`确定删除角色「${role.name}」？`)) return;
    await window.api.role.delete(role.id);
    loadData();
  };

  return (
    <div className="role-manager">
      <div className="rm-header">
        <h3>🎭 角色管理</h3>
        <button className="btn-add" onClick={openCreate}>+ 新建角色</button>
      </div>

      <div className="rm-list">
        {roles.map((role) => (
          <div key={role.id} className="role-card">
            <div className="role-card-left">
              <span className="role-icon">{role.icon}</span>
              <div className="role-info">
                <div className="role-name">{role.name}</div>
                <div className="role-meta">
                  {role.is_custom ? '自定义' : '内置'} · {providers.find(p => p.id === role.provider_id)?.name || role.provider_id}
                  · T={role.config.temperature} · Max={role.config.max_tokens}
                </div>
                <div className="role-prompt-preview">{role.system_prompt.substring(0, 80)}...</div>
              </div>
            </div>
            <div className="role-card-actions">
              <button className="btn-edit" onClick={() => openEdit(role)} title="编辑">✏️</button>
              {role.is_custom && (
                <button className="btn-delete" onClick={() => handleDelete(role)} title="删除">🗑️</button>
              )}
            </div>
          </div>
        ))}
        {roles.length === 0 && <div className="empty-state">暂无角色</div>}
      </div>

      {/* 创建/编辑弹窗 */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingRole ? '编辑角色' : '新建角色'}</h3>

            <div className="form-group">
              <label>名称</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="角色名称" />
            </div>

            <div className="form-group">
              <label>图标</label>
              <div className="icon-picker">
                {ICONS.map((ic) => (
                  <button key={ic} className={`icon-option ${form.icon === ic ? 'selected' : ''}`}
                    onClick={() => setForm({ ...form, icon: ic })}>{ic}</button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>绑定提供商</label>
              <select value={form.provider_id} onChange={(e) => setForm({ ...form, provider_id: e.target.value })}>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>系统提示词</label>
              <textarea rows={6} value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                placeholder="输入角色的系统提示词..." />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>温度 ({form.temperature})</label>
                <input type="range" min="0" max="2" step="0.1" value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })} />
              </div>
              <div className="form-group">
                <label>最大 Token</label>
                <input type="number" min="256" max="32768" step="256" value={form.max_tokens}
                  onChange={(e) => setForm({ ...form, max_tokens: parseInt(e.target.value) || 4096 })} />
              </div>
            </div>

            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setShowForm(false)}>取消</button>
              <button className="btn-confirm" onClick={handleSave} disabled={!form.name.trim()}>
                {editingRole ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
