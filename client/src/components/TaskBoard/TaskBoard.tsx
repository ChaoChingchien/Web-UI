import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Project, SubTask, TaskStatus, TaskPriority, AIRole, AIProvider, TaskAutoDecomposeResult } from '@shared/types';
import { LoadingSpinner } from '../LoadingSpinner';
import { useToast } from '../Toast';
import { KanbanColumn } from './KanbanColumn';
import './TaskBoard.css';

const COLUMNS: { status: TaskStatus; title: string; color: string }[] = [
  { status: 'todo', title: '📋 待办', color: '#6b7280' },
  { status: 'in_progress', title: '🔨 进行中', color: '#3b82f6' },
  { status: 'review', title: '👀 审核中', color: '#f59e0b' },
  { status: 'done', title: '✅ 已完成', color: '#22c55e' },
  { status: 'cancelled', title: '❌ 已取消', color: '#ef4444' },
];

interface TaskBoardProps {
  onOpenConversation?: (conversationId: string) => void;
}

export const TaskBoard: React.FC<TaskBoardProps> = ({ onOpenConversation }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [tasks, setTasks] = useState<SubTask[]>([]);
  const [roles, setRoles] = useState<AIRole[]>([]);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showAutoDecompose, setShowAutoDecompose] = useState(false);
  const [autoDecomposeGoal, setAutoDecomposeGoal] = useState('');
  /** null = 尚未拆解（步骤 1）；数组 = 拆解完成，进入预览步骤 2 */
  const [decomposeCandidates, setDecomposeCandidates] = useState<TaskAutoDecomposeResult['tasks'] | null>(null);
  const [decomposing, setDecomposing] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '' });
  const [showEditProject, setShowEditProject] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectForm, setEditProjectForm] = useState({ name: '', description: '' });
  const [showDeleteProjectConfirm, setShowDeleteProjectConfirm] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '', description: '', priority: 'medium' as TaskPriority,
    assigneeProviderId: '', assigneeRoleId: '',
  });
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const dragCounter = useRef<Record<string, number>>({});
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [p, r, pv] = await Promise.all([
        window.api.project.list(),
        window.api.role.list(),
        window.api.provider.list(),
      ]);
      setProjects(p);
      setRoles(r);
      setProviders(pv);
      if (p.length > 0 && !selectedProject) setSelectedProject(p[0].id);
    } catch (err) {
      console.error('加载看板数据失败:', err);
      setLoadError('加载数据失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (selectedProject) {
      window.api.task.list(selectedProject).then(setTasks).catch((err) => {
        console.error('加载任务失败:', err);
      });
    }
  }, [selectedProject]);

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, SubTask[]> = { todo: [], in_progress: [], review: [], done: [], cancelled: [] };
    for (const t of tasks) {
      if (map[t.status]) map[t.status].push(t);
    }
    return map;
  }, [tasks]);

  const handleCreateProject = useCallback(async () => {
    if (!newProject.name.trim()) return;
    try {
      await window.api.project.create(newProject);
      toast('success', '项目已创建');
      setNewProject({ name: '', description: '' });
      setShowCreateProject(false);
      loadData();
    } catch (err) {
      console.error('创建项目失败:', err);
      toast('error', '创建项目失败');
    }
  }, [newProject, toast, loadData]);

  const openEditProject = useCallback((project: Project) => {
    setEditingProjectId(project.id);
    setEditProjectForm({ name: project.name, description: project.description || '' });
    setShowEditProject(true);
  }, []);

  const handleEditProject = useCallback(async () => {
    if (!editingProjectId || !editProjectForm.name.trim()) return;
    try {
      await window.api.project.update(editingProjectId, editProjectForm);
      toast('success', '项目已更新');
      setShowEditProject(false);
      setEditingProjectId(null);
      loadData();
    } catch (err) {
      console.error('更新项目失败:', err);
      toast('error', '更新项目失败');
    }
  }, [editingProjectId, editProjectForm, toast, loadData]);

  const handleDeleteProject = useCallback(async () => {
    if (!selectedProject) return;
    try {
      await window.api.project.delete(selectedProject);
      toast('success', '项目已删除');
      setSelectedProject(null);
      setShowDeleteProjectConfirm(false);
      setTasks([]);
      loadData();
    } catch (err) {
      console.error('删除项目失败:', err);
      toast('error', '删除项目失败');
    }
  }, [selectedProject, toast, loadData]);

  const handleCreateTask = useCallback(async () => {
    if (!newTask.title.trim() || !selectedProject) return;
    try {
      await window.api.task.create({ projectId: selectedProject, ...newTask });
      toast('success', '任务已创建');
      setNewTask({ title: '', description: '', priority: 'medium', assigneeProviderId: '', assigneeRoleId: '' });
      setShowCreateTask(false);
      const updated = await window.api.task.list(selectedProject);
      setTasks(updated);
    } catch (err) {
      console.error('创建任务失败:', err);
      toast('error', '创建任务失败');
    }
  }, [newTask, selectedProject, toast]);

  const handleMoveTask = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    try {
      await window.api.task.move(taskId, newStatus);
      if (selectedProject) {
        const updated = await window.api.task.list(selectedProject);
        setTasks(updated);
      }
    } catch (err) {
      console.error('移动任务失败:', err);
      toast('error', '移动任务失败');
    }
  }, [selectedProject, toast]);

  const handleAutoDecompose = useCallback(async () => {
    if (!autoDecomposeGoal.trim() || !selectedProject) return;
    setDecomposing(true);
    try {
      const result = await window.api.task.autoDecompose(selectedProject, autoDecomposeGoal);
      // 进入步骤 2：预览/编辑候选任务，由用户确认后才真正入库
      setDecomposeCandidates(result.tasks);
    } catch (err) {
      console.error('拆解失败:', err);
      toast('error', `拆解失败：${err instanceof Error ? err.message : '请重试'}`);
    } finally {
      setDecomposing(false);
    }
  }, [autoDecomposeGoal, selectedProject, toast]);

  /** 步骤 2：用户确认候选任务 → 批量入库 */
  const handleCommitDecomposition = useCallback(async () => {
    if (!selectedProject || !decomposeCandidates || decomposeCandidates.length === 0) return;
    try {
      await window.api.task.commitDecomposition(selectedProject, decomposeCandidates);
      toast('success', `已创建 ${decomposeCandidates.length} 个任务`);
      const updated = await window.api.task.list(selectedProject);
      setTasks(updated);
      // 重置并关闭
      setDecomposeCandidates(null);
      setAutoDecomposeGoal('');
      setShowAutoDecompose(false);
    } catch (err) {
      console.error('创建任务失败:', err);
      toast('error', '创建任务失败');
    }
  }, [selectedProject, decomposeCandidates, toast]);

  /** 关闭拆解对话框（同时重置候选） */
  const handleCloseAutoDecompose = useCallback(() => {
    setShowAutoDecompose(false);
    setDecomposeCandidates(null);
    setAutoDecomposeGoal('');
  }, []);

  /** 修改候选任务的某个字段 */
  const handleUpdateCandidate = useCallback((idx: number, patch: Partial<TaskAutoDecomposeResult['tasks'][number]>) => {
    setDecomposeCandidates((cur) => {
      if (!cur) return cur;
      const next = [...cur];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  /** 删除一条候选任务 */
  const handleRemoveCandidate = useCallback((idx: number) => {
    setDecomposeCandidates((cur) => cur ? cur.filter((_, i) => i !== idx) : cur);
  }, []);

  /** 任务"开工"：为 assignee 建对话，跳到对话 tab */
  const handleStartTask = useCallback(async (taskId: string) => {
    try {
      const { conversationId } = await window.api.task.start(taskId);
      if (selectedProject) {
        const updated = await window.api.task.list(selectedProject);
        setTasks(updated);
      }
      if (onOpenConversation) onOpenConversation(conversationId);
    } catch (err) {
      console.error('开工失败:', err);
      toast('error', `开工失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, [selectedProject, toast, onOpenConversation]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      await window.api.task.delete(taskId);
      if (selectedProject) {
        const updated = await window.api.task.list(selectedProject);
        setTasks(updated);
      }
    } catch (err) {
      console.error('删除任务失败:', err);
      toast('error', '删除任务失败');
    }
  }, [selectedProject, toast]);

  // DnD handlers
  const handleDragStart = useCallback((taskId: string) => setDraggedTaskId(taskId), []);

  const handleDragEnd = useCallback(() => {
    setDraggedTaskId(null);
    setDragOverColumn(null);
    dragCounter.current = {};
  }, []);

  const handleColumnDragEnter = useCallback((status: TaskStatus) => {
    dragCounter.current[status] = (dragCounter.current[status] || 0) + 1;
    if (dragCounter.current[status] > 0) setDragOverColumn(status);
  }, []);

  const handleColumnDragLeave = useCallback((status: TaskStatus) => {
    dragCounter.current[status] = Math.max(0, (dragCounter.current[status] || 0) - 1);
    if (dragCounter.current[status] <= 0) {
      setDragOverColumn((prev) => (prev === status ? null : prev));
    }
  }, []);

  const handleDrop = useCallback(async (status: TaskStatus) => {
    if (draggedTaskId) {
      const task = tasks.find((t) => t.id === draggedTaskId);
      if (task && task.status !== status) {
        await handleMoveTask(draggedTaskId, status);
      }
    }
    handleDragEnd();
  }, [draggedTaskId, tasks, handleMoveTask, handleDragEnd]);

  if (loading) {
    return <LoadingSpinner fullscreen text="加载任务看板..." />;
  }

  return (
    <div className="task-board">
      <div className="board-header">
        <div className="project-selector">
          <select className="input" value={selectedProject || ''} onChange={(e) => setSelectedProject(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={() => setShowCreateProject(true)}>+ 项目</button>
          {selectedProject && (
            <>
              <button className="btn btn-sm btn-outline" title="编辑项目" onClick={() => {
                const p = projects.find((pr) => pr.id === selectedProject);
                if (p) openEditProject(p);
              }}>✏️ 编辑</button>
              <button className="btn btn-sm btn-outline-danger" title="删除项目" onClick={() => setShowDeleteProjectConfirm(true)}>🗑️ 删除</button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAutoDecompose(true)} disabled={!selectedProject}>
            AI 拆解
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreateTask(true)} disabled={!selectedProject}>
            + 子任务
          </button>
        </div>
      </div>

      {loadError && (
        <div style={{ padding: 16, color: 'var(--danger)' }}>
          {loadError}
          <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={loadData}>重试</button>
        </div>
      )}

      <div className="kanban-board">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            status={col.status}
            title={col.title}
            color={col.color}
            tasks={tasksByStatus[col.status]}
            roles={roles}
            dragOverColumn={dragOverColumn}
            draggedTaskId={draggedTaskId}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragEnter={handleColumnDragEnter}
            onDragLeave={handleColumnDragLeave}
            onDrop={handleDrop}
            onMoveTask={handleMoveTask}
            onOpenConversation={onOpenConversation}
            onDeleteTask={handleDeleteTask}
            onStartTask={handleStartTask}
          />
        ))}
      </div>

      {/* Create Project Dialog */}
      {showCreateProject && (
        <div className="modal-overlay" onClick={() => setShowCreateProject(false)}>
          <div className="modal" style={{ width: 400, padding: 24 }} onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowCreateProject(false);
              if (e.key === 'Enter' && !e.shiftKey && newProject.name.trim()) handleCreateProject();
            }}
          >
            <h3>创建项目</h3>
            <div className="form-group" style={{ marginTop: 16 }}>
              <label>项目名称</label>
              <input className="input" value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} placeholder="输入项目名称" />
            </div>
            <div className="form-group">
              <label>描述</label>
              <input className="input" value={newProject.description} onChange={(e) => setNewProject({ ...newProject, description: e.target.value })} placeholder="项目描述" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn" onClick={() => setShowCreateProject(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreateProject}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Dialog */}
      {showCreateTask && (
        <div className="modal-overlay" onClick={() => setShowCreateTask(false)}>
          <div className="modal" style={{ width: 460, padding: 24 }} onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowCreateTask(false);
              if (e.key === 'Enter' && !e.shiftKey && newTask.title.trim()) handleCreateTask();
            }}
          >
            <h3>创建子任务</h3>
            <div className="form-group" style={{ marginTop: 16 }}>
              <label>任务标题</label>
              <input className="input" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} placeholder="输入任务标题" />
            </div>
            <div className="form-group">
              <label>描述</label>
              <input className="input" value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} placeholder="任务详细描述" />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>优先级</label>
                <select className="input" value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as TaskPriority })}>
                  <option value="urgent">紧急</option>
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1.5 }}>
                <label>指派角色</label>
                <select
                  className="input"
                  value={newTask.assigneeRoleId || ''}
                  onChange={(e) => {
                    const roleId = e.target.value;
                    const role = roleId ? roles.find((r) => r.id === roleId) : undefined;
                    setNewTask({
                      ...newTask,
                      assigneeRoleId: roleId,
                      // 跟随角色默认 provider，用户可再覆盖
                      assigneeProviderId: role?.provider_id || '',
                    });
                  }}
                >
                  <option value="">不分派</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.icon} {r.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {newTask.assigneeRoleId && (
              <div className="form-group">
                <label>使用的模型</label>
                <select
                  className="input"
                  value={newTask.assigneeProviderId || ''}
                  onChange={(e) => setNewTask({ ...newTask, assigneeProviderId: e.target.value })}
                >
                  <option value="">跟随角色默认</option>
                  {providers.filter(p => p.is_enabled).map((p) => (
                    <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn" onClick={() => setShowCreateTask(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreateTask}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* Auto Decompose Dialog — 两步：输入 → 预览/确认 */}
      {showAutoDecompose && (
        <div className="modal-overlay" onClick={handleCloseAutoDecompose}>
          <div
            className="modal decompose-modal"
            style={{ width: decomposeCandidates ? 640 : 460 }}
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') handleCloseAutoDecompose();
            }}
          >
            {/* 步骤 1：输入目标 */}
            {!decomposeCandidates && (
              <>
                <h3>AI 拆解任务</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
                  描述一个目标，AI 会拆成候选子任务并建议指派的角色，下一步你可以逐条审阅再确认入库。
                </p>
                <div className="form-group" style={{ marginTop: 16 }}>
                  <textarea
                    className="input"
                    value={autoDecomposeGoal}
                    onChange={(e) => setAutoDecomposeGoal(e.target.value)}
                    placeholder="如：开发一个 TODO 应用，包含前后端..."
                    rows={4}
                    style={{ resize: 'vertical' }}
                    autoFocus
                    disabled={decomposing}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                  <button className="btn" onClick={handleCloseAutoDecompose} disabled={decomposing}>取消</button>
                  <button
                    className="btn btn-primary"
                    onClick={handleAutoDecompose}
                    disabled={!autoDecomposeGoal.trim() || decomposing}
                  >
                    {decomposing ? 'AI 拆解中…' : '开始拆解'}
                  </button>
                </div>
              </>
            )}

            {/* 步骤 2：候选预览 */}
            {decomposeCandidates && (
              <>
                <h3>审阅候选任务（{decomposeCandidates.length}）</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
                  可以修改标题、描述、优先级，或者重新指派角色；不想要的可以删掉。确认后批量创建。
                </p>
                <div className="candidate-list">
                  {decomposeCandidates.map((c, idx) => (
                    <div key={idx} className="candidate-row">
                      <div className="candidate-row-head">
                        <input
                          className="input candidate-title"
                          value={c.title}
                          onChange={(e) => handleUpdateCandidate(idx, { title: e.target.value })}
                          placeholder="任务标题"
                        />
                        <select
                          className="input candidate-priority"
                          value={c.priority}
                          onChange={(e) => handleUpdateCandidate(idx, { priority: e.target.value as TaskPriority })}
                        >
                          <option value="urgent">紧急</option>
                          <option value="high">高</option>
                          <option value="medium">中</option>
                          <option value="low">低</option>
                        </select>
                        <button
                          className="candidate-remove"
                          onClick={() => handleRemoveCandidate(idx)}
                          title="移除此任务"
                          aria-label="移除"
                        >×</button>
                      </div>
                      <textarea
                        className="input candidate-desc"
                        value={c.description || ''}
                        onChange={(e) => handleUpdateCandidate(idx, { description: e.target.value })}
                        placeholder="任务描述"
                        rows={2}
                      />
                      <div className="candidate-assign">
                        <span className="candidate-assign-label">指派给</span>
                        <select
                          className="input candidate-role"
                          value={c.suggestedRoleId || ''}
                          onChange={(e) => {
                            const roleId = e.target.value || undefined;
                            const role = roleId ? roles.find((r) => r.id === roleId) : undefined;
                            handleUpdateCandidate(idx, {
                              suggestedRoleId: roleId,
                              suggestedProviderId: role?.provider_id || undefined,
                            });
                          }}
                        >
                          <option value="">未分派</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>{r.icon} {r.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 20 }}>
                  <button className="btn" onClick={() => setDecomposeCandidates(null)}>
                    ← 重新拆解
                  </button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={handleCloseAutoDecompose}>放弃</button>
                    <button
                      className="btn btn-primary"
                      onClick={handleCommitDecomposition}
                      disabled={decomposeCandidates.length === 0}
                    >
                      确认创建 {decomposeCandidates.length} 个任务
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit Project Dialog */}
      {showEditProject && (
        <div className="modal-overlay" onClick={() => { setShowEditProject(false); setEditingProjectId(null); }}>
          <div className="modal" style={{ width: 400, padding: 24 }} onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setShowEditProject(false); setEditingProjectId(null); }
              if (e.key === 'Enter' && !e.shiftKey && editProjectForm.name.trim()) handleEditProject();
            }}
          >
            <h3>编辑项目</h3>
            <div className="form-group" style={{ marginTop: 16 }}>
              <label>项目名称</label>
              <input className="input" value={editProjectForm.name} onChange={(e) => setEditProjectForm({ ...editProjectForm, name: e.target.value })} placeholder="输入项目名称" />
            </div>
            <div className="form-group">
              <label>描述</label>
              <input className="input" value={editProjectForm.description} onChange={(e) => setEditProjectForm({ ...editProjectForm, description: e.target.value })} placeholder="项目描述" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn" onClick={() => { setShowEditProject(false); setEditingProjectId(null); }}>取消</button>
              <button className="btn btn-primary" onClick={handleEditProject}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Project Confirm Dialog */}
      {showDeleteProjectConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteProjectConfirm(false)}>
          <div className="modal" style={{ width: 380, padding: 24 }} onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowDeleteProjectConfirm(false);
              if (e.key === 'Enter' && !e.shiftKey) handleDeleteProject();
            }}
          >
            <h3>确认删除项目</h3>
            <p style={{ margin: '12px 0', color: 'var(--text-secondary)' }}>
              确定要删除 "{projects.find((p) => p.id === selectedProject)?.name}" 吗？此操作不可撤销，所有子任务将被清空。
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowDeleteProjectConfirm(false)}>取消</button>
              <button className="btn btn-danger" onClick={handleDeleteProject}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
