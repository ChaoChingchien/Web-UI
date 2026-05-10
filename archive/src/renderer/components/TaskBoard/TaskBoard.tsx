import React, { useState, useEffect, useRef } from 'react';
import type { Project, SubTask, TaskStatus, TaskPriority, AIRole } from '@shared/types';
import './TaskBoard.css';

const COLUMNS: { status: TaskStatus; title: string; color: string }[] = [
  { status: 'todo', title: '📋 待办', color: '#6b7280' },
  { status: 'in_progress', title: '🔨 进行中', color: '#3b82f6' },
  { status: 'review', title: '👀 审核中', color: '#f59e0b' },
  { status: 'done', title: '✅ 已完成', color: '#22c55e' },
  { status: 'cancelled', title: '❌ 已取消', color: '#ef4444' },
];

const PRIORITY_LABELS: Record<TaskPriority, { label: string; color: string }> = {
  urgent: { label: '紧急', color: '#ef4444' },
  high: { label: '高', color: '#f97316' },
  medium: { label: '中', color: '#3b82f6' },
  low: { label: '低', color: '#6b7280' },
};

interface TaskBoardProps {
  onOpenConversation?: (conversationId: string) => void;
}

export const TaskBoard: React.FC<TaskBoardProps> = ({ onOpenConversation }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [tasks, setTasks] = useState<SubTask[]>([]);
  const [roles, setRoles] = useState<AIRole[]>([]);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showAutoDecompose, setShowAutoDecompose] = useState(false);
  const [autoDecomposeGoal, setAutoDecomposeGoal] = useState('');
  const [newProject, setNewProject] = useState({ name: '', description: '' });
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium' as TaskPriority, assigneeProviderId: '', assigneeRoleId: '' });

  useEffect(() => {
    loadProjects();
    loadRoles();
  }, []);

  useEffect(() => {
    if (selectedProject) loadTasks(selectedProject);
  }, [selectedProject]);

  const loadProjects = async () => {
    const p = await window.api.project.list();
    setProjects(p);
    if (p.length > 0 && !selectedProject) setSelectedProject(p[0].id);
  };

  const loadTasks = async (projectId: string) => {
    const t = await window.api.task.list(projectId);
    setTasks(t);
  };

  const loadRoles = async () => {
    const r = await window.api.role.list();
    setRoles(r);
  };

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) return;
    await window.api.project.create(newProject);
    setNewProject({ name: '', description: '' });
    setShowCreateProject(false);
    loadProjects();
  };

  const handleCreateTask = async () => {
    if (!newTask.title.trim() || !selectedProject) return;
    await window.api.task.create({ projectId: selectedProject, ...newTask });
    setNewTask({ title: '', description: '', priority: 'medium', assigneeProviderId: '', assigneeRoleId: '' });
    setShowCreateTask(false);
    loadTasks(selectedProject);
  };

  const handleMoveTask = async (taskId: string, newStatus: TaskStatus) => {
    await window.api.task.move(taskId, newStatus);
    if (selectedProject) loadTasks(selectedProject);
  };

  const handleAutoDecompose = async () => {
    if (!autoDecomposeGoal.trim() || !selectedProject) return;
    await window.api.task.autoDecompose(selectedProject, autoDecomposeGoal);
    setAutoDecomposeGoal('');
    setShowAutoDecompose(false);
    loadTasks(selectedProject);
  };

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const dragCounter = useRef<Record<string, number>>({});

  const getTasksByStatus = (status: TaskStatus) => tasks.filter((t) => t.status === status);

  const selectedProjectData = projects.find((p) => p.id === selectedProject);

  const handleDragStart = (taskId: string) => {
    setDraggedTaskId(taskId);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverColumn(null);
  };

  const handleColumnDragEnter = (status: TaskStatus) => {
    if (!dragCounter.current[status]) dragCounter.current[status] = 0;
    dragCounter.current[status]++;
    setDragOverColumn(status);
  };

  const handleColumnDragLeave = (status: TaskStatus) => {
    if (!dragCounter.current[status]) dragCounter.current[status] = 0;
    dragCounter.current[status]--;
    if (dragCounter.current[status] <= 0) {
      dragCounter.current[status] = 0;
      setDragOverColumn(prev => prev === status ? null : prev);
    }
  };

  const handleDrop = async (status: TaskStatus) => {
    if (draggedTaskId && draggedTaskId !== status) {
      await handleMoveTask(draggedTaskId, status);
    }
    setDraggedTaskId(null);
    setDragOverColumn(null);
    dragCounter.current = {};
  };

  return (
    <div className="task-board">
      {/* 顶部栏 */}
      <div className="board-header">
        <div className="project-selector">
          <select value={selectedProject || ''} onChange={(e) => setSelectedProject(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button className="btn-add" onClick={() => setShowCreateProject(true)}>+ 项目</button>
        </div>
        <div className="board-actions">
          <button className="btn-auto" onClick={() => setShowAutoDecompose(true)}>🤖 AI 拆解</button>
          <button className="btn-add-task" onClick={() => setShowCreateTask(true)}>+ 子任务</button>
        </div>
      </div>

      {/* 看板列 */}
      <div className="kanban-board">
        {COLUMNS.map((col) => (
          <div
            key={col.status}
            className={`kanban-column ${dragOverColumn === col.status ? 'drag-over' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={() => handleColumnDragEnter(col.status)}
            onDragLeave={() => handleColumnDragLeave(col.status)}
            onDrop={(e) => { e.preventDefault(); handleDrop(col.status); }}
          >
            <div className="column-header" style={{ borderTopColor: col.color }}>
              <span className="column-title">{col.title}</span>
              <span className="column-count">{getTasksByStatus(col.status).length}</span>
            </div>
            <div className="column-tasks">
              {getTasksByStatus(col.status).map((task) => (
                <div
                  key={task.id}
                  className={`task-card ${task.conversation_id ? 'has-conversation' : ''} ${draggedTaskId === task.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(task.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => {
                    if (task.conversation_id && onOpenConversation) {
                      onOpenConversation(task.conversation_id);
                    }
                  }}
                >
                  <div className="task-header">
                    <span
                      className="task-priority"
                      style={{ backgroundColor: PRIORITY_LABELS[task.priority].color }}
                    >
                      {PRIORITY_LABELS[task.priority].label}
                    </span>
                    {task.conversation_id && (
                      <span className="task-conversation-link" title="点击打开对话">💬</span>
                    )}
                  </div>
                  <div className="task-title">{task.title}</div>
                  {task.description && (
                    <div className="task-desc">{task.description}</div>
                  )}
                  <div className="task-footer" onClick={(e) => e.stopPropagation()}>
                    <select
                      className="task-status-select"
                      value={task.status}
                      onChange={(e) => handleMoveTask(task.id, e.target.value as TaskStatus)}
                    >
                      {COLUMNS.map((c) => (
                        <option key={c.status} value={c.status}>{c.title}</option>
                      ))}
                    </select>
                    <button className="btn-delete-task" onClick={() => window.api.task.delete(task.id).then(() => loadTasks(selectedProject!))}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 创建项目弹窗 */}
      {showCreateProject && (
        <div className="modal-overlay" onClick={() => setShowCreateProject(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>创建项目</h3>
            <div className="form-group">
              <label>项目名称</label>
              <input value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} placeholder="输入项目名称" />
            </div>
            <div className="form-group">
              <label>描述</label>
              <input value={newProject.description} onChange={(e) => setNewProject({ ...newProject, description: e.target.value })} placeholder="项目描述" />
            </div>
            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setShowCreateProject(false)}>取消</button>
              <button className="btn-confirm" onClick={handleCreateProject}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* 创建任务弹窗 */}
      {showCreateTask && (
        <div className="modal-overlay" onClick={() => setShowCreateTask(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>创建子任务</h3>
            <div className="form-group">
              <label>任务标题</label>
              <input value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} placeholder="输入任务标题" />
            </div>
            <div className="form-group">
              <label>描述</label>
              <input value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} placeholder="任务详细描述" />
            </div>
            <div className="form-group">
              <label>优先级</label>
              <select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as TaskPriority })}>
                <option value="urgent">🔴 紧急</option>
                <option value="high">🟠 高</option>
                <option value="medium">🔵 中</option>
                <option value="low">⚪ 低</option>
              </select>
            </div>
            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setShowCreateTask(false)}>取消</button>
              <button className="btn-confirm" onClick={handleCreateTask}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* AI 自动拆解弹窗 */}
      {showAutoDecompose && (
        <div className="modal-overlay" onClick={() => setShowAutoDecompose(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>🤖 AI 自动拆解任务</h3>
            <p className="modal-hint">描述你的大目标，AI 将自动拆解为可执行的子任务</p>
            <div className="form-group">
              <textarea
                value={autoDecomposeGoal}
                onChange={(e) => setAutoDecomposeGoal(e.target.value)}
                placeholder="如：开发一个 TODO 应用，包含前后端..."
                rows={4}
              />
            </div>
            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setShowAutoDecompose(false)}>取消</button>
              <button className="btn-confirm" onClick={handleAutoDecompose} disabled={!autoDecomposeGoal.trim()}>
                🚀 开始拆解
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
