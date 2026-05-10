import React, { useState, useEffect } from 'react';
import type { AIProvider, ProviderType } from '@shared/types';
import { LoadingSpinner } from '../LoadingSpinner';
import { useToast } from '../Toast';
import { ProviderFormDialog } from './ProviderFormDialog';
import './ProviderManager.css';

export const ProviderManager: React.FC = () => {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [form, setForm] = useState({
    name: '', icon: '🤖', type: 'web' as ProviderType,
    url: '', api_key: '', model: '', base_url: '',
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const { toast } = useToast();

  const loadProviders = async () => {
    setLoading(true);
    try {
      const p = await window.api.provider.list();
      setProviders(p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProviders(); }, []);

  const openCreate = () => {
    setEditingProvider(null);
    setForm({ name: '', icon: '🤖', type: 'web', url: '', api_key: '', model: '', base_url: '' });
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
    });
    setTestResult(null);
    setShowForm(true);
  };

  const buildProviderData = (): Partial<AIProvider> => {
    const data: Partial<AIProvider> = {
      name: form.name.trim(), icon: form.icon, type: form.type, url: form.url || undefined,
    };
    if (form.type === 'api') {
      data.api_config = { baseUrl: form.base_url, apiKey: form.api_key, model: form.model };
    } else if (form.type === 'local') {
      data.local_config = { baseUrl: form.base_url, apiKey: form.api_key, model: form.model };
    }
    return data;
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const data = buildProviderData();
    if (editingProvider) {
      await window.api.provider.update(editingProvider.id, data);
      toast('success', `提供商「${form.name}」已更新`);
    } else {
      await window.api.provider.add(data);
      toast('success', `提供商「${form.name}」已创建`);
    }
    setShowForm(false);
    loadProviders();
  };

  const handleDelete = async (provider: AIProvider) => {
    await window.api.provider.delete(provider.id);
    toast('info', `提供商「${provider.name}」已删除`);
    loadProviders();
  };

  const handleTest = async () => {
    if (editingProvider) {
      setTesting(true);
      setTestResult(null);
      try {
        const result = await window.api.provider.test(editingProvider.id);
        setTestResult(result);
      } catch (err) {
        setTestResult({ success: false, message: String(err) });
      } finally {
        setTesting(false);
      }
    } else {
      // Save first, then test
      setTesting(true);
      setTestResult(null);
      try {
        const data = buildProviderData();
        const created = await window.api.provider.add(data);
        const result = await window.api.provider.test(created.id);
        setTestResult(result);
        // If test fails, offer to rollback
        if (!result.success) {
          toast('error', `测试失败: ${result.message}`);
        } else {
          toast('success', '连接测试通过');
        }
      } catch (err) {
        setTestResult({ success: false, message: String(err) });
      } finally {
        setTesting(false);
      }
    }
  };

  const handleLogin = async (provider: AIProvider) => {
    try {
      const result = await window.api.provider.login(provider.id);
      if (result.success) {
        toast('success', '浏览器已打开，请完成登录');
      } else {
        toast('error', `登录失败: ${result.message}`);
      }
    } catch (err) {
      toast('error', `登录失败: ${String(err)}`);
    }
  };

  return (
    <div className="provider-manager">
      <div className="pm-header">
        <h3>提供商管理</h3>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>+ 新建提供商</button>
      </div>

      <div className="pm-list">
        {loading ? (
          <LoadingSpinner fullscreen text="加载提供商列表..." />
        ) : (
          <>
            {providers.map((provider) => (
              <div key={provider.id} className="provider-card">
                <div className="provider-card-left">
                  <span className="provider-icon-lg">{provider.icon || '🤖'}</span>
                  <div className="provider-info">
                    <div className="provider-name">{provider.name}</div>
                    <div className="provider-meta">
                      {({ web: 'Web 自动化', api: 'API 接入', local: '本地模型' })[provider.type]}
                      {provider.api_config?.model && ` · ${provider.api_config.model}`}
                      {provider.local_config?.model && ` · ${provider.local_config.model}`}
                      {provider.url && ` · ${provider.url}`}
                    </div>
                  </div>
                </div>
                <div className="provider-card-actions">
                  {provider.type === 'web' && provider.url && (
                    <button className="btn btn-ghost btn-sm" onClick={() => handleLogin(provider)} title="打开浏览器登录">🔑</button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(provider)} title="编辑">✏️</button>
                  {provider.is_custom && (
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(provider)} title="删除">🗑️</button>
                  )}
                </div>
              </div>
            ))}
            {!loading && providers.length === 0 && <div className="empty-state">暂无提供商</div>}
          </>
        )}
      </div>

      {showForm && (
        <ProviderFormDialog
          form={form}
          setForm={setForm}
          editing={!!editingProvider}
          testing={testing}
          onTest={handleTest}
          testResult={testResult}
          onSave={handleSave}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
};
