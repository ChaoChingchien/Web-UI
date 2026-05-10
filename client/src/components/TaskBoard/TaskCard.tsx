import React from 'react';
import type { SubTask, TaskStatus, AIRole } from '@shared/types';

const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: 'todo', title: '待办' },
  { status: 'in_progress', title: '进行中' },
  { status: 'review', title: '审核中' },
  { status: 'done', title: '已完成' },
  { status: 'cancelled', title: '已取消' },
];

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  urgent: { label: '紧急', color: '#ef4444' },
  high: { label: '高', color: '#f97316' },
  medium: { label: '中', color: '#3b82f6' },
  low: { label: '低', color: '#6b7280' },
};

interface Props {
  task: SubTask;
  role?: AIRole;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onOpenConversation?: (conversationId: string) => void;
  onDelete: (taskId: string) => void;
  onStart: (taskId: string) => void;
}

export const TaskCard: React.FC<Props> = ({
  task, role, isDragging,
  onDragStart, onDragEnd, onMoveTask, onOpenConversation, onDelete, onStart,
}) => {
  const prio = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.medium;
  const hasAssignee = Boolean(task.assignee_role_id);
  const hasConversation = Boolean(task.conversation_id);
  const canStart = hasAssignee && !hasConversation && task.status !== 'done' && task.status !== 'cancelled';

  return (
    <div
      className={`task-card ${task.conversation_id ? 'has-conversation' : ''} ${isDragging ? 'dragging' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={() => {
        if (task.conversation_id && onOpenConversation) {
          onOpenConversation(task.conversation_id);
        }
      }}
    >
      <div className="task-header">
        <span className="task-priority" style={{ backgroundColor: prio.color }}>
          {prio.label}
        </span>
        {hasConversation && (
          <span className="task-conversation-link" title="点击打开对话">💬</span>
        )}
      </div>
      <div className="task-title">{task.title}</div>
      {task.description && <div className="task-desc">{task.description}</div>}

      <div className="task-assignee" onClick={(e) => e.stopPropagation()}>
        {hasAssignee && role ? (
          <span className="assignee-badge" title={`负责：${role.name}`}>
            <span className="assignee-icon">{role.icon || '🤖'}</span>
            <span className="assignee-name">{role.name}</span>
          </span>
        ) : (
          <span className="assignee-badge assignee-none">未分派</span>
        )}
      </div>

      <div className="task-footer" onClick={(e) => e.stopPropagation()}>
        {canStart ? (
          <button
            className="task-action-btn task-start-btn"
            onClick={() => onStart(task.id)}
            title="为分派的角色创建对话并开始处理"
          >
            ▶ 开工
          </button>
        ) : hasConversation ? (
          <button
            className="task-action-btn task-continue-btn"
            onClick={() => task.conversation_id && onOpenConversation?.(task.conversation_id)}
            title="打开关联对话"
          >
            💬 继续
          </button>
        ) : (
          <select
            className="task-status-select"
            value={task.status}
            onChange={(e) => onMoveTask(task.id, e.target.value as TaskStatus)}
          >
            {COLUMNS.map((c) => (
              <option key={c.status} value={c.status}>{c.title}</option>
            ))}
          </select>
        )}
        <button className="btn-delete-task" onClick={() => onDelete(task.id)} title="删除任务">🗑️</button>
      </div>
    </div>
  );
};
