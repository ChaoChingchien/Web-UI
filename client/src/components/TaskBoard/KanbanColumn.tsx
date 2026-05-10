import React from 'react';
import type { SubTask, TaskStatus, AIRole } from '@shared/types';
import { TaskCard } from './TaskCard';

interface Props {
  status: TaskStatus;
  title: string;
  color: string;
  tasks: SubTask[];
  roles: AIRole[];
  dragOverColumn: TaskStatus | null;
  draggedTaskId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragEnter: (status: TaskStatus) => void;
  onDragLeave: (status: TaskStatus) => void;
  onDrop: (status: TaskStatus) => void;
  onMoveTask: (taskId: string, newStatus: TaskStatus) => void;
  onOpenConversation?: (conversationId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onStartTask: (taskId: string) => void;
  className?: string;
}

export const KanbanColumn: React.FC<Props> = ({
  status, title, color, tasks, roles,
  dragOverColumn, draggedTaskId,
  onDragStart, onDragEnd, onDragEnter, onDragLeave, onDrop,
  onMoveTask, onOpenConversation, onDeleteTask, onStartTask,
  className,
}) => (
  <div
    className={`kanban-column ${dragOverColumn === status ? 'drag-over' : ''} ${className || ''}`}
    onDragOver={(e) => e.preventDefault()}
    onDragEnter={() => onDragEnter(status)}
    onDragLeave={() => onDragLeave(status)}
    onDrop={(e) => {
      e.preventDefault();
      onDrop(status);
      // Reset drag counters after drop
      const syntheticLeave = new Event('dragleave', { bubbles: true });
      e.currentTarget.dispatchEvent(syntheticLeave);
    }}
  >
    <div className="column-header" style={{ borderTopColor: color }}>
      <span className="column-title">{title}</span>
      <span className="column-count">{tasks.length}</span>
    </div>
    <div className="column-tasks">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          role={task.assignee_role_id ? roles.find((r) => r.id === task.assignee_role_id) : undefined}
          isDragging={draggedTaskId === task.id}
          onDragStart={() => onDragStart(task.id)}
          onDragEnd={onDragEnd}
          onMoveTask={onMoveTask}
          onOpenConversation={onOpenConversation}
          onDelete={onDeleteTask}
          onStart={onStartTask}
        />
      ))}
    </div>
  </div>
);
