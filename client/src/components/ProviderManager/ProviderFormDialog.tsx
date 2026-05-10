import React, { useState } from 'react';

const ICONS = ['🤖', '🧠', '💬', '🔮', '⚡', '🌟', '🎯', '🔧', '📡', '🏠'];

interface Props {
  form: { name: string; icon: string; type: 'web' | 'api' | 'local'; url: string; api_key: string; model: string; base_url: string };
  setForm: (f: Props['form']) => void;
  editing: boolean;
  testing: boolean;
  onTest: () => void;
  testResult: { success: boolean; message: string } | null;
  onSave: () => void;
  onClose: () => void;
}

export const ProviderFormDialog: React.FC<Props> = ({
  form, setForm, editing, testing, onTest, testResult, onSave, onClose,
}) => {
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 520, padding: 24 }} onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter' && !e.shiftKey && form.name.trim()) onSave();
        }}
      >
        <h3>{editing ? '编辑提供商' : '新建提供商'}</h3>

        <div className="form-group" style={{ marginTop: 16 }}>
          <label>名称</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="提供商名称" />
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
          <label>类型</label>
          <div className="type-selector">
            {([
              { value: 'web' as const, label: 'Web 自动化' },
              { value: 'api' as const, label: 'API 接入' },
              { value: 'local' as const, label: '本地模型' },
            ]).map((opt) => (
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
            <input className="input" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
          </div>
        )}

        {(form.type === 'api' || form.type === 'local') && (
          <>
            <div className="form-group">
              <label>Base URL</label>
              <input className="input" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                placeholder={form.type === 'api' ? 'https://api.openai.com/v1' : 'http://localhost:11434/v1'} />
            </div>
            <div className="form-group">
              <label>API Key {form.type === 'local' && <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 12 }}>（本地模型可留空）</span>}</label>
              <div style={{ position: 'relative' }}>
                <input className="input" type={showKey ? 'text' : 'password'} value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder="sk-..." />
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}
                  onClick={() => setShowKey(!showKey)}
                  tabIndex={-1}
                >
                  {showKey ? '隐藏' : '显示'}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>模型</label>
              <input className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder={form.type === 'api' ? 'gpt-4' : 'llama3'} />
            </div>
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button className="btn btn-sm" onClick={onTest} disabled={testing}>
            {testing ? '测试中...' : '测试连接'}
          </button>
          {testResult && (
            <span style={{ fontSize: 13, color: testResult.success ? 'var(--success)' : 'var(--danger)' }}>
              {testResult.success ? '✓' : '✕'} {testResult.message}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={onSave} disabled={!form.name.trim()}>
            {editing ? '保存' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
};
