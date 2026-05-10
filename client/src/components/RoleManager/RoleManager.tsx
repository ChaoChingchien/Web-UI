import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { AIRole } from '@shared/types';
import { LoadingSpinner } from '../LoadingSpinner';
import { useToast } from '../Toast';
import { RoleFormDialog, type ParsedRole } from './RoleFormDialog';
import './RoleManager.css';

/** ============================================
 *  角色管理 — Claude 风格
 *  含：收藏 · 最近使用 · 密度切换 · 响应式头部
 *  ============================================ */

const LS_FAV = 'rm.favorites.v1';
const LS_RECENT = 'rm.recent.v1';
const LS_DENSITY = 'rm.density.v1';
const RECENT_MAX = 12;

const CATEGORIES: { key: string; label: string; icon: string; tint: string; pinned?: boolean }[] = [
  { key: 'all',       label: '全部',   icon: '✦', tint: 'all',     pinned: true },
  { key: 'favorites', label: '收藏',   icon: '★', tint: 'fav',     pinned: true },
  { key: 'recent',    label: '最近',   icon: '◴', tint: 'recent',  pinned: true },
  { key: 'dev',       label: '研发',   icon: '◈', tint: 'dev' },
  { key: 'product',   label: '产品',   icon: '◉', tint: 'product' },
  { key: 'content',   label: '内容',   icon: '✎', tint: 'content' },
  { key: 'business',  label: '商务',   icon: '◆', tint: 'business' },
  { key: 'academic',  label: '学术',   icon: '❖', tint: 'academic' },
  { key: 'life',      label: '生活',   icon: '◐', tint: 'life' },
  { key: 'tools',     label: '工具',   icon: '🔧', tint: 'tools' },
  { key: 'learn',     label: '学习',   icon: '📚', tint: 'learn' },
  { key: 'custom',    label: '自定义', icon: '✍', tint: 'custom' },
];

/** 内置角色的静态分类（角色 id 必须是 'role_xxx' 静态形式，否则落到"商务"） */
const ROLE_CATEGORY_MAP: Record<string, string> = {
  // 研发
  role_programmer: 'dev', role_architect: 'dev', role_tester: 'dev',
  role_devops: 'dev', role_data_scientist: 'dev',
  role_frontend: 'dev', role_backend: 'dev', role_code_reviewer: 'dev',
  role_security: 'dev', role_algorithm: 'dev',
  role_game_dev: 'dev', role_embedded: 'dev', role_blockchain_dev: 'dev',
  role_ml_engineer: 'dev', role_prompt_engineer: 'dev', role_perf_engineer: 'dev',
  role_tech_writer: 'dev',
  // 产品
  role_pm: 'product', role_designer: 'product', role_manager: 'product', role_analyst: 'product',
  role_user_researcher: 'product', role_operations: 'product', role_growth: 'product',
  // 内容
  role_writer: 'content', role_creative: 'content', role_translator: 'content',
  role_marketing: 'content', role_researcher: 'content', role_reviewer: 'content',
  role_copywriter: 'content', role_editor: 'content',
  role_social_media: 'content', role_storyteller: 'content',
  role_poet: 'content', role_novelist: 'content', role_rapper: 'content',
  role_composer: 'content', role_art_instructor: 'content', role_calligrapher: 'content',
  role_photographer: 'content', role_film_critic: 'content', role_standup_comedian: 'content',
  role_mj_prompt: 'content', role_etymologist: 'content',
  // 商务
  role_lawyer: 'business', role_finance: 'business',
  role_sales: 'business', role_hr: 'business', role_strategist: 'business',
  role_customer_success: 'business', role_ba: 'business',
  role_tech_interviewer: 'business', role_behavioral_interviewer: 'business',
  role_resume_optimizer: 'business', role_investor: 'business', role_vc_pitch: 'business',
  role_negotiator: 'business', role_speechwriter: 'business', role_naming_expert: 'business',
  role_journalist: 'business', role_real_estate: 'business',
  // 学术
  role_teacher: 'academic',
  role_academic_mentor: 'academic', role_paper_writer: 'academic',
  role_literature: 'academic', role_science_writer: 'academic',
  // 生活
  role_doctor: 'life', role_psychologist: 'life', role_chef: 'life', role_fitness: 'life',
  role_travel: 'life', role_personal_finance: 'life',
  role_parenting: 'life', role_career_coach: 'life', role_assistant: 'life',
  role_nutritionist: 'life', role_sleep_coach: 'life', role_yoga_teacher: 'life',
  role_meditation_guide: 'life', role_relationship_coach: 'life', role_fashion_stylist: 'life',
  role_pet_behavior: 'life', role_home_organizer: 'life', role_plant_care: 'life',
  role_diy_crafter: 'life',
  // 工具
  role_linux_terminal: 'tools', role_js_console: 'tools', role_sql_master: 'tools',
  role_regex_expert: 'tools', role_git_expert: 'tools', role_docker_expert: 'tools',
  role_k8s_expert: 'tools', role_shell_expert: 'tools', role_emoji_translator: 'tools',
  role_mindmap_gen: 'tools', role_password_helper: 'tools', role_glossary_gen: 'tools',
  // 学习
  role_english_speaking: 'learn', role_english_grammar: 'learn', role_japanese_teacher: 'learn',
  role_mathematician: 'learn', role_physicist: 'learn', role_chemist: 'learn',
  role_biologist: 'learn', role_historian: 'learn', role_philosopher: 'learn',
  role_socratic_tutor: 'learn',
};

const CATEGORY_LABELS: Record<string, string> = {
  dev: '研发', product: '产品', content: '内容',
  business: '商务', academic: '学术', life: '生活',
  tools: '工具', learn: '学习',
  custom: '自定义',
};

function getRoleCategory(role: AIRole): string {
  if (role.is_custom) return 'custom';
  return ROLE_CATEGORY_MAP[role.id] || 'business';
}

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}

export const RoleManager: React.FC = () => {
  const [roles, setRoles] = useState<AIRole[]>([]);
  const [providers, setProviders] = useState<{ id: string; name: string; icon: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<AIRole | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AIRole | null>(null);
  const [form, setForm] = useState({
    name: '', icon: '🤖', system_prompt: '', provider_id: '',
    temperature: 0.7, max_tokens: 4096,
  });

  // 收藏 / 最近 / 密度（持久化到 localStorage）
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(loadLocal<string[]>(LS_FAV, []))
  );
  const [recent, setRecent] = useState<string[]>(
    () => loadLocal<string[]>(LS_RECENT, []).slice(0, RECENT_MAX)
  );
  const [density, setDensity] = useState<'comfortable' | 'compact'>(
    () => (loadLocal<string>(LS_DENSITY, 'comfortable') === 'compact' ? 'compact' : 'comfortable')
  );
  useEffect(() => { try { localStorage.setItem(LS_FAV, JSON.stringify([...favorites])); } catch { /* */ } }, [favorites]);
  useEffect(() => { try { localStorage.setItem(LS_RECENT, JSON.stringify(recent)); } catch { /* */ } }, [recent]);
  useEffect(() => { try { localStorage.setItem(LS_DENSITY, density); } catch { /* */ } }, [density]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const markRecent = useCallback((id: string) => {
    setRecent((cur) => [id, ...cur.filter((x) => x !== id)].slice(0, RECENT_MAX));
  }, []);

  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([window.api.role.list(), window.api.provider.list()]);
      setRoles(r);
      setProviders(p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filteredRoles = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    let base: AIRole[];
    if (filterCategory === 'favorites') {
      base = roles.filter((r) => favorites.has(r.id));
    } else if (filterCategory === 'recent') {
      const byId = new Map(roles.map((r) => [r.id, r]));
      base = recent
        .map((id) => byId.get(id))
        .filter((r): r is AIRole => Boolean(r));
    } else if (filterCategory === 'all') {
      base = roles;
    } else {
      base = roles.filter((r) => getRoleCategory(r) === filterCategory);
    }
    if (!kw) return base;
    return base.filter((r) =>
      r.name.toLowerCase().includes(kw) ||
      (r.system_prompt || '').toLowerCase().includes(kw)
    );
  }, [roles, filterCategory, keyword, favorites, recent]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: roles.length,
      favorites: roles.reduce((n, r) => n + (favorites.has(r.id) ? 1 : 0), 0),
      recent: recent.filter((id) => roles.some((r) => r.id === id)).length,
    };
    for (const role of roles) {
      const cat = getRoleCategory(role);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [roles, favorites, recent]);

  const openCreate = () => {
    setEditingRole(null);
    setForm({ name: '', icon: '🤖', system_prompt: '', provider_id: '', temperature: 0.7, max_tokens: 4096 });
    setShowForm(true);
  };

  const openEdit = (role: AIRole) => {
    setEditingRole(role);
    markRecent(role.id);
    setForm({
      name: role.name, icon: role.icon, system_prompt: role.system_prompt || '',
      provider_id: role.provider_id || '',
      temperature: role.config?.temperature ?? 0.7,
      max_tokens: role.config?.max_tokens ?? 4096,
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
      toast('success', `角色「${form.name}」已更新`);
    } else {
      const created = await window.api.role.create(data);
      toast('success', `角色「${form.name}」已创建`);
      if (created?.id) markRecent(created.id);
    }
    setShowForm(false);
    loadData();
  };

  const handleBatchImport = async (items: ParsedRole[]) => {
    let ok = 0, fail = 0;
    for (const item of items) {
      try {
        await window.api.role.create({
          name: item.name,
          icon: item.icon,
          system_prompt: item.system_prompt,
          provider_id: item.provider_id || '',
          config: { temperature: item.temperature, max_tokens: item.max_tokens },
        });
        ok++;
      } catch (err) {
        console.error('批量导入失败:', item.name, err);
        fail++;
      }
    }
    if (ok > 0) toast('success', `成功导入 ${ok} 个角色${fail ? `（失败 ${fail}）` : ''}`);
    else if (fail > 0) toast('error', `导入失败 (${fail})`);
    setShowForm(false);
    loadData();
  };

  const handleDelete = async (role: AIRole) => {
    await window.api.role.delete(role.id);
    toast('info', `角色「${role.name}」已删除`);
    setConfirmDelete(null);
    // 清理本地收藏 / 最近里的残留
    setFavorites((cur) => {
      if (!cur.has(role.id)) return cur;
      const next = new Set(cur); next.delete(role.id); return next;
    });
    setRecent((cur) => cur.filter((id) => id !== role.id));
    loadData();
  };

  const providerLabel = (role: AIRole): string | null => {
    if (!role.provider_id) return null;
    return providers.find((p) => p.id === role.provider_id)?.name || role.provider_id;
  };

  return (
    <div className={`role-manager rm-density-${density}`}>
      {/* 单行紧凑头部：标题 · 搜索 · 密度 · 新建 */}
      <header className="rm-hero">
        <div className="rm-hero-title-col">
          <h3 className="rm-hero-title">
            角色库
            <span className="rm-hero-count">{roles.length}</span>
          </h3>
        </div>

        <div className="rm-search">
          <span className="rm-search-icon">⌕</span>
          <input
            type="text"
            placeholder="搜索角色或提示词…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {keyword && (
            <button className="rm-search-clear" onClick={() => setKeyword('')} aria-label="清空">×</button>
          )}
        </div>

        <div className="rm-hero-actions">
          <div className="rm-density-toggle" role="group" aria-label="显示密度">
            <button
              className={density === 'comfortable' ? 'active' : ''}
              onClick={() => setDensity('comfortable')}
              title="舒适密度"
              aria-label="舒适"
            >▦</button>
            <button
              className={density === 'compact' ? 'active' : ''}
              onClick={() => setDensity('compact')}
              title="紧凑密度"
              aria-label="紧凑"
            >▤</button>
          </div>
          <button className="rm-btn-primary" onClick={openCreate} title="新建角色">
            <span className="rm-btn-plus">+</span>
            <span className="rm-btn-label">新建</span>
          </button>
        </div>
      </header>

      <div className="rm-filter-row">
        {CATEGORIES.map((cat) => {
          const count = categoryCounts[cat.key] || 0;
          const active = filterCategory === cat.key;
          return (
            <button
              key={cat.key}
              className={`rm-chip rm-chip-${cat.tint} ${active ? 'active' : ''} ${cat.pinned ? 'pinned' : ''}`}
              onClick={() => setFilterCategory(cat.key)}
            >
              <span className="rm-chip-icon">{cat.icon}</span>
              <span>{cat.label}</span>
              {count > 0 && <span className="rm-chip-count">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="rm-scroll">
        {loading ? (
          <LoadingSpinner fullscreen text="加载角色库..." />
        ) : filteredRoles.length === 0 ? (
          <div className="rm-empty">
            <div className="rm-empty-icon">
              {filterCategory === 'favorites' ? '☆'
                : filterCategory === 'recent' ? '◴'
                : '∅'}
            </div>
            <div className="rm-empty-title">
              {keyword ? '没有匹配的角色'
                : filterCategory === 'favorites' ? '还没有收藏的角色'
                : filterCategory === 'recent' ? '还没有使用过的角色'
                : '这个分类还没有角色'}
            </div>
            <div className="rm-empty-desc">
              {filterCategory === 'favorites' ? (
                <span>在任意卡片右上角点击 ☆ 即可收藏</span>
              ) : filterCategory === 'recent' ? (
                <span>编辑过的角色会出现在这里</span>
              ) : (
                <button className="rm-empty-link" onClick={openCreate}>+ 新建一个角色</button>
              )}
            </div>
          </div>
        ) : (
          <div className="rm-grid">
            {filteredRoles.map((role) => {
              const cat = getRoleCategory(role);
              const isFav = favorites.has(role.id);
              const provName = providerLabel(role);
              return (
                <article key={role.id} className={`rm-card rm-card-${cat}`}>
                  <button
                    className={`rm-card-fav ${isFav ? 'active' : ''}`}
                    onClick={() => toggleFavorite(role.id)}
                    title={isFav ? '取消收藏' : '收藏'}
                    aria-label={isFav ? '取消收藏' : '收藏'}
                  >{isFav ? '★' : '☆'}</button>

                  <div className="rm-card-head">
                    <div className="rm-card-avatar" aria-hidden>{role.icon || '🤖'}</div>
                    <div className="rm-card-title-col">
                      <div className="rm-card-title">{role.name}</div>
                      <div className="rm-card-sub">
                        <span className={`rm-card-tag rm-card-tag-${cat}`}>{CATEGORY_LABELS[cat] || cat}</span>
                        {provName && <span className="rm-card-provider" title={provName}>{provName}</span>}
                      </div>
                    </div>
                  </div>

                  <p className="rm-card-prompt">
                    {role.system_prompt?.trim() || '（暂无提示词）'}
                  </p>

                  <div className="rm-card-foot">
                    <div className="rm-card-meta">
                      <span>T · {role.config?.temperature ?? 0.7}</span>
                      <span className="rm-card-meta-sep">·</span>
                      <span>{role.config?.max_tokens ?? 4096} tok</span>
                    </div>
                    <div className="rm-card-actions">
                      <button className="rm-btn-ghost" onClick={() => openEdit(role)} title="编辑">✏</button>
                      {role.is_custom && (
                        <button
                          className="rm-btn-ghost rm-btn-danger"
                          onClick={() => setConfirmDelete(role)}
                          title="删除"
                        >🗑</button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <RoleFormDialog
          form={form}
          setForm={setForm}
          providers={providers}
          editing={!!editingRole}
          onSave={handleSave}
          onClose={() => setShowForm(false)}
          onBatchImport={handleBatchImport}
        />
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal rm-confirm" onClick={(e) => e.stopPropagation()}>
            <h4 className="rm-confirm-title">删除角色「{confirmDelete.name}」？</h4>
            <p className="rm-confirm-desc">此操作不可撤销，该角色的自定义提示词会一并移除。</p>
            <div className="rm-confirm-actions">
              <button className="rm-btn-outline" onClick={() => setConfirmDelete(null)}>取消</button>
              <button
                className="rm-btn-primary rm-btn-primary-danger"
                onClick={() => handleDelete(confirmDelete)}
              >确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
