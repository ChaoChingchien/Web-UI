import React from 'react';
import type { WebAutomationConfig } from '@shared/types';

export type CapabilityTier = 'L0' | 'L1' | 'L2';

interface Props {
  modeCfg?: NonNullable<WebAutomationConfig['modeSelector']>;
  modelCfg?: NonNullable<WebAutomationConfig['modelSelector']>;
  toggleCfgs: { label: string; selector: string; container?: string; defaultOn?: boolean }[];
  currentMode: string;
  currentModel: string;
  toggleStates: Record<string, boolean>;
  onModeChange: (name: string) => void;
  onModelChange: (name: string) => void;
  onToggleChange: (label: string) => void;
  autoDispatch?: boolean;
  autoDispatchDisabled?: boolean;
  onAutoDispatchToggle?: () => void;
  tier?: CapabilityTier;
  onTierChange?: (t: CapabilityTier) => void;
}

const TIER_ITEMS: { value: CapabilityTier; label: string; title: string }[] = [
  { value: 'L0', label: '⚡ 快',   title: '优先选用成本最低的模型，响应更快、更省' },
  { value: 'L1', label: '⚖️ 平衡', title: '在成本和质量之间取得平衡（默认）' },
  { value: 'L2', label: '🎯 精细', title: '优先选用质量最高的模型，适合复杂任务' },
];

export const ChatToolbar: React.FC<Props> = ({
  modeCfg, modelCfg, toggleCfgs,
  currentMode, currentModel, toggleStates,
  onModeChange, onModelChange, onToggleChange,
  autoDispatch, autoDispatchDisabled, onAutoDispatchToggle,
  tier, onTierChange,
}) => {
  const hasAutoDispatch = typeof onAutoDispatchToggle === 'function';
  const hasTier = typeof onTierChange === 'function';
  if (!modeCfg && !modelCfg && toggleCfgs.length === 0 && !hasAutoDispatch && !hasTier) return null;

  return (
    <div className="chat-toolbar">
      {hasTier && (
        <div className="toolbar-group-tier" role="group" aria-label="质量档位">
          {TIER_ITEMS.map((it) => (
            <button
              key={it.value}
              type="button"
              className={tier === it.value ? 'active' : ''}
              onClick={() => onTierChange!(it.value)}
              title={it.title}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
      {modeCfg && (
        <div className="toolbar-group">
          <span className="toolbar-label">模式</span>
          {modeCfg.buttons.map(btn => (
            <button
              key={btn.name}
              className={`toolbar-btn ${currentMode === btn.name ? 'active' : ''}`}
              onClick={() => onModeChange(btn.name)}
            >
              {btn.name}
            </button>
          ))}
        </div>
      )}
      {modelCfg && (
        <div className="toolbar-group">
          <span className="toolbar-label">模型</span>
          {modelCfg.buttons.map(btn => (
            <button
              key={btn.name}
              className={`toolbar-btn ${currentModel === btn.name ? 'active' : ''}`}
              onClick={() => onModelChange(btn.name)}
            >
              {btn.name}
            </button>
          ))}
        </div>
      )}
      {toggleCfgs.length > 0 && (
        <div className="toolbar-group">
          {toggleCfgs.map(t => (
            <label key={t.label} className="toolbar-toggle">
              <input
                type="checkbox"
                checked={toggleStates[t.label] ?? false}
                onChange={() => onToggleChange(t.label)}
              />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
      )}
      {hasAutoDispatch && (
        <div className="toolbar-group toolbar-group-autodispatch">
          <button
            type="button"
            className={`toolbar-btn toolbar-btn-autodispatch ${autoDispatch ? 'active' : ''}`}
            onClick={onAutoDispatchToggle}
            disabled={autoDispatchDisabled}
            title="开启后系统会自动挑选最合适的角色回答"
          >
            🎯 自动调度
          </button>
        </div>
      )}
    </div>
  );
};
