import React, { useState, useEffect } from 'react';
import type { AIProvider, ProviderType } from '@shared/types';
import './ProviderManager.css';

const TYPE_OPTIONS: { value: ProviderType; label: string }[] = [
  { value: 'web', label: '🌐 Web 自动化' },
  { value: 'api', label: '🔌 API 接入' },
  { value: 'local', label: '💻 本地模型' },
];

const PROVIDER_ICONS = ['🤖', '🧠', '💬', '🔮', '⚡', '🌟', '🎯', '🔧', '📡', '🏠'];

export const ProviderManager: React.FC = () => {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [form, setForm] = useState({
    name: '', icon: '🤖', type: 'web' as ProviderType,
    url: '', api_key: '', model: '', base_url: '',
    temperature: 0.7, max_tokens: 4096,
  });
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => { loadProviders(); }, []);

  const loadProviders = async () => {
    const p = await window.api.provider.list();
    setProviders(p);
  };

  const openCreate = () => {
    setEditingProvider(null);
    setForm({ name: '', icon: '🤖', type: 'web', url: '', api_key: '', model: '', base_url: '', temperature: 0.7, max_tokens: 4096 });
    setTestResult(null);
    setShowForm(true);
  };

  const openEdit = (provider: AIProvider) => {
    setEditingProvider(provider);
    setForm({
      name: provider.name, icon: provider.icon, type: provider.type,
      url: provider.url || '',
      api_key: provider.api_config?.apiKey || provider.local_config?.apiKey || '',
      model: provider.api_config?.model || provider.local_config?.model || '',
      base_url: provider.api_config?.baseUrl || provider.local_config?.baseUrl || '',
      temperature: 0.7, max_tokens: 4096,
    });
    setTestResult(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const data: Partial<AIProvider> = {
      name: form.name.trim(), icon: form.icon, type: form.type, url: form.url || undefined,
    };
    if (form.type === 'api') {
      data.api_config = { baseUrl: form.base_url, apiKey: form.api_key, model: form.model };
    } else if (form.type === 'local') {
      data.local_config = { baseUrl: form.base_url, apiKey: form.api_key, model: form.model };
    }
    if (editingProvider) {
      await window.api.provider.update(editingProvider.id, data);
    } else {
      await window.api.provider.add(data);
    }
    setShowForm(false);
    loadProviders();
  };

  const handleDelete = async (provider: AIProvider) => {
    if (!confirm(`确定删除提供商「${provider.name}」？`)) return;
    await window.api.provider.delete(provider.id);
    loadProviders();
  };

  const handleTest = async () => {
    // 先保存再测试，或者用临时 ID
    setTesting('current');
    setTestResult(null);
    try {
      if (editingProvider) {
        const result = await window.api.provider.test(editingProvider.id);
        setTestResult(result);
      } else {
        // 先创建再测试
        const data: Partial<AIProvider> = {
          name: form.name.trim(), icon: form.icon, type: form.type, url: form.url || undefined,
        };
        if (form.type === 'api') {
          data.api_config = { baseUrl: form.base_url, apiKey: form.api_key, model: form.model };
        } else if (form.type === 'local') {
          data.local_config = { baseUrl: form.base_url, apiKey: form.api_key, model: form.model };
        }
        const created = await window.api.provider.add(data);
        loadProviders();
        const result = await window.api.provider.test(created.id);
        setTestResult(result);
      }
    } catch (err) {
      setTestResult({ success: false, message: String(err) });
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="provider-manager">
      <div className="pm-header">
        <h3>🔌 提供商管理</h3>
        <button className="btn-add" onClick={openCreate}>+ 新建提供商</button>
      </div>

      <div className="pm-list">
        {providers.map((provider) => (
          <div key={provider.id} className="provider-card">
            <div className="provider-card-left">
              <span className="provider-icon-lg">{provider.icon}</span>
              <div className="provider-info">
                <div className="provider-name">{provider.name}</div>
                <div className="provider-meta">
                  {TYPE_OPTIONS.find(t => t.value === provider.type)?.label || provider.type}
                  {provider.api_config?.model && ` · ${provider.api_config.model}`}
                  {provider.local_config?.model && ` · ${provider.local_config.model}`}
                  {provider.url && ` · ${provider.url}`}
                </div>
              </div>
            </div>
            <div className="provider-card-actions">
              <button className="btn-edit" onClick={() => openEdit(provider)} title="编辑">✏️</button>
              {provider.is_custom && (
                <button className="btn-delete" onClick={() => handleDelete(provider)} title="删除">🗑️</button>
              )}
            </div>
          </div>
        ))}
        {providers.length === 0 && <div className="empty-state">暂无提供商</div>}
      </div>

      {/* 创建/编辑弹窗 */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingProvider ? '编辑提供商' : '新建提供商'}</h3>

            <div className="form-group">
              <label>名称</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="提供商名称" />
            </div>

            <div className="form-group">
              <label>图标</label>
              <div className="icon-picker">
                {PROVIDER_ICONS.map((ic) => (
                  <button key={ic} className={`icon-option ${form.icon === ic ? 'selected' : ''}`}
                    onClick={() => setForm({ ...form, icon: ic })}>{ic}</button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>类型</label>
              <div className="type-selector">
                {TYPE_OPTIONS.map((opt) => (
                  <button key={opt.value}
                    className={`type-option ${form.type === opt.value ? 'selected' : ''}`}
                    onClick={() => setForm({ ...form, type: opt.value })}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {form.type === 'web' && (
              <div className="form-group">
                <label>网页 URL</label>
                <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
              </div>
            )}

            {(form.type === 'api' || form.type === 'local') && (
              <>
                <div className="form-group">
                  <label>Base URL</label>
                  <input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                    placeholder={form.type === 'api' ? 'https://api.openai.com/v1' : 'http://localhost:11434/v1'} />
                </div>
                <div className="form-group">
                  <label>API Key {form.type === 'local' && <span className="hint">（本地模型可留空）</span>}</label>
                  <input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                    placeholder="sk-..." />
                </div>
                <div className="form-group">
                  <label>模型</label>
                  <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder={form.type === 'api' ? 'gpt-4' : 'llama3'} />
                </div>
              </>
            )}

            {/* 测试连接 */}
            <div className="form-group test-section">
              <button className="btn-test" onClick={handleTest} disabled={testing === 'current'}>
                {testing === 'current' ? '⏳ 测试中...' : '🔗 测试连接'}
              </button>
              {testResult && (
                <span className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                  {testResult.success ? '✅' : '❌'} {testResult.message}
                </span>
              )}
            </div>

            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setShowForm(false)}>取消</button>
              <button className="btn-confirm" onClick={handleSave} disabled={!form.name.trim()}>
                {editingProvider ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
