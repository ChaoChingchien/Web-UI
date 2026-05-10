import React, { useState } from 'react';

const ICONS = [
  '🤖', '🔍', '✍️', '✅', '💻', '🎨', '📊', '🌐', '📋', '🧠',
  '🎯', '🔧', '📝', '💡', '🏗️', '🛡️', '📚', '💰', '⚖️', '🏥',
  '🚀', '💪', '👨‍🍳', '📢', '🧪', '🖌️', '📈',
];

export interface ParsedRole {
  name: string;
  icon: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  provider_id?: string;
}

interface Props {
  form: { name: string; icon: string; system_prompt: string; provider_id: string; temperature: number; max_tokens: number };
  setForm: (f: Props['form']) => void;
  providers: { id: string; name: string; icon: string }[];
  editing: boolean;
  onSave: () => void;
  onClose: () => void;
  onBatchImport: (items: ParsedRole[]) => Promise<void>;
}

export const RoleFormDialog: React.FC<Props> = ({ form, setForm, providers: _providers, editing, onSave, onClose, onBatchImport }) => {
  const [importMode, setImportMode] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const parseImport = (): ParsedRole[] | null => {
    try {
      const raw = JSON.parse(importText);
      const arr = Array.isArray(raw) ? raw : [raw];
      const parsed: ParsedRole[] = [];
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const name = typeof o.name === 'string' ? o.name.trim() : '';
        if (!name) continue;
        const prompt = (o.system_prompt ?? o.systemPrompt ?? o.prompt ?? '') as unknown;
        parsed.push({
          name,
          icon: typeof o.icon === 'string' && o.icon ? o.icon : '🤖',
          system_prompt: typeof prompt === 'string' ? prompt : '',
          temperature: typeof o.temperature === 'number' ? o.temperature : 0.7,
          max_tokens: typeof o.max_tokens === 'number' ? o.max_tokens : 4096,
          provider_id: typeof o.provider_id === 'string' ? o.provider_id : '',
        });
      }
      if (parsed.length === 0) {
        setImportError('未解析到任何有效角色（至少要有 name 字段）');
        return null;
      }
      return parsed;
    } catch (err) {
      setImportError(`JSON 解析失败：${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };

  const handleTryFillForm = () => {
    const parsed = parseImport();
    if (!parsed) return;
    if (parsed.length > 1) {
      setImportError(`检测到 ${parsed.length} 条，预览填入仅支持单条；请改用"批量创建"`);
      return;
    }
    const p = parsed[0];
    setForm({
      name: p.name, icon: p.icon, system_prompt: p.system_prompt,
      provider_id: p.provider_id || '',
      temperature: p.temperature, max_tokens: p.max_tokens,
    });
    setImportMode(false);
    setImportText('');
  };

  const handleBatchImportClick = async () => {
    const parsed = parseImport();
    if (!parsed) return;
    await onBatchImport(parsed);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal rm-form-dialog" onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (!importMode && e.key === 'Enter' && (e.metaKey || e.ctrlKey) && form.name.trim()) onSave();
        }}
      >
        <header className="rm-form-head">
          <div className="rm-form-head-row">
            <div className="rm-form-head-text">
              <h3 className="rm-form-title">{editing ? '编辑角色' : '新建角色'}</h3>
              <div className="rm-form-sub">
                <span>定义一个能稳定交付的"专家"</span>
                <span className="rm-kbd-hint">Ctrl/⌘ + Enter 保存</span>
              </div>
            </div>
            <button
              type="button"
              className="rm-import-toggle"
              onClick={() => { setImportMode(!importMode); setImportError(null); }}
              disabled={editing}
              title={editing ? '编辑模式不支持 JSON 导入' : '从 JSON 导入'}
            >
              {importMode ? '← 返回表单' : '📋 从 JSON 粘贴'}
            </button>
          </div>
        </header>

        {importMode ? (
          <div className="rm-form-body">
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              粘贴一个对象（单个角色）或数组（批量导入）。字段：name / icon / system_prompt（或 systemPrompt / prompt）/ temperature / max_tokens / provider_id。
            </p>
            <textarea
              className="input rm-import-textarea"
              rows={14}
              value={importText}
              onChange={(e) => { setImportText(e.target.value); setImportError(null); }}
              placeholder={JSON.stringify([{ name: '角色名', icon: '🤖', system_prompt: '你是一名...' }], null, 2)}
              spellCheck={false}
            />
            {importError && <div className="rm-import-error">{importError}</div>}
          </div>
        ) : (
          <div className="rm-form-body">
            <div className="rm-form-row rm-form-row-inline">
              <div className="form-group rm-form-name">
                <label>名称</label>
                <input
                  className="input" autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="如：前端架构师"
                />
              </div>
              <div className="form-group rm-form-icon-col">
                <label>当前图标</label>
                <div className="rm-icon-current">
                  <span className="rm-icon-current-display">{form.icon}</span>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="rm-form-label-row">
                <span>选择图标</span>
              </label>
              <div className="icon-picker">
                {ICONS.map((ic) => (
                  <button type="button" key={ic}
                    className={`icon-option ${form.icon === ic ? 'selected' : ''}`}
                    onClick={() => setForm({ ...form, icon: ic })}
                  >{ic}</button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="rm-form-label-row">
                <span>系统提示词</span>
                <span className="rm-form-label-hint">能做什么 · 不能做什么 · 交付什么</span>
              </label>
              <textarea className="input rm-prompt-textarea" rows={10} value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                placeholder={'你是一名……\n你只做一件事：……\n\n你可以：\n- ……\n\n你不可以：……'}
                spellCheck={false}
              />
            </div>

            <div className="rm-form-row rm-form-row-inline">
              <div className="form-group rm-form-range-group">
                <label className="rm-form-label-row">
                  <span>温度</span>
                  <span className="rm-form-range-value">{form.temperature.toFixed(1)}</span>
                </label>
                <input type="range" min="0" max="2" step="0.1" value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })} />
                <div className="rm-form-range-axis">
                  <span>精确</span><span>平衡</span><span>发散</span>
                </div>
              </div>
              <div className="form-group rm-form-tokens">
                <label>最大 Token</label>
                <input className="input" type="number" min="256" max="32768" step="256" value={form.max_tokens}
                  onChange={(e) => setForm({ ...form, max_tokens: parseInt(e.target.value) || 4096 })} />
              </div>
            </div>
          </div>
        )}

        <footer className="rm-form-foot">
          {importMode ? (
            <>
              <button type="button" className="rm-btn-outline" onClick={onClose}>取消</button>
              <button type="button" className="rm-btn-primary" onClick={handleTryFillForm}>仅预览填入</button>
              <button type="button" className="rm-btn-primary" onClick={handleBatchImportClick}>批量创建</button>
            </>
          ) : (
            <>
              <button type="button" className="rm-btn-outline" onClick={onClose}>取消</button>
              <button type="button" className="rm-btn-primary" onClick={onSave} disabled={!form.name.trim()}>
                {editing ? '保存修改' : '创建角色'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
};
