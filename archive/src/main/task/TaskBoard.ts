import type { SubTask, TaskStatus } from '@shared/types';
import { TaskManager } from './TaskManager';

export interface KanbanColumn {
  status: TaskStatus;
  title: string;
  tasks: SubTask[];
}

export interface KanbanData {
  columns: KanbanColumn[];
}

/** 看板逻辑 — 从 TaskManager 获取数据并转换为看板结构 */
export class TaskBoardService {
  private taskManager = new TaskManager();

  getKanbanData(projectId: string): KanbanData {
    return this.taskManager.getKanbanData(projectId);
  }
}
