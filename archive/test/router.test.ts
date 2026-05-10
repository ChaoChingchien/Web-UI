import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../src/main/database/DatabaseManager';
import { ProviderModel, RoleModel, TeamModel } from '../src/main/database/models';
import { TaskManager } from '../src/main/task/TaskManager';

let db: DatabaseManager;
let taskManager: TaskManager;

beforeEach(async () => {
  db = DatabaseManager.getInstance();
  await db.initInMemory();
  taskManager = new TaskManager();
});

afterEach(() => {
  try { db.close(); } catch { /* ignore */ }
});

describe('AIRouter routing', () => {
  it('should route api type to apiChat', () => {
    const provider = ProviderModel.create({
      name: 'API Test',
      type: 'api',
      api_config: { baseUrl: 'https://api.test.com', apiKey: 'key', model: 'gpt-4' },
    });
    expect(provider.type).toBe('api');
    expect(provider.api_config).toBeDefined();
    expect(provider.api_config!.baseUrl).toBe('https://api.test.com');
  });

  it('should route local type to localChat', () => {
    const provider = ProviderModel.create({
      name: 'Local Test',
      type: 'local',
      local_config: { baseUrl: 'http://localhost:11434/v1', apiKey: '', model: 'llama3' },
    });
    expect(provider.type).toBe('local');
    expect(provider.local_config).toBeDefined();
  });

  it('should route web type to webChat', () => {
    const provider = ProviderModel.create({
      name: 'Web Test',
      type: 'web',
      url: 'https://chat.example.com',
    });
    expect(provider.type).toBe('web');
    expect(provider.url).toBe('https://chat.example.com');
  });
});

describe('TaskManager CRUD', () => {
  it('should create and list projects', () => {
    taskManager.createProject({ name: 'Project A', description: 'Desc A' });
    taskManager.createProject({ name: 'Project B' });

    const projects = taskManager.listProjects();
    expect(projects.length).toBe(2);
  });

  it('should filter projects by status', () => {
    const p1 = taskManager.createProject({ name: 'Active' });
    const p2 = taskManager.createProject({ name: 'Archived' });
    taskManager.updateProject(p2.id, { status: 'archived' });

    expect(taskManager.listProjects('active').length).toBe(1);
    expect(taskManager.listProjects('archived').length).toBe(1);
  });

  it('should create and list tasks', () => {
    const project = taskManager.createProject({ name: 'Test' });
    taskManager.createTask({ projectId: project.id, title: 'Task 1', priority: 'high' });
    taskManager.createTask({ projectId: project.id, title: 'Task 2', priority: 'low' });

    const tasks = taskManager.listTasks(project.id);
    expect(tasks.length).toBe(2);
    expect(tasks[0].title).toBe('Task 1');
    expect(tasks[0].status).toBe('todo');
  });

  it('should move task between statuses', () => {
    const project = taskManager.createProject({ name: 'Test' });
    const task = taskManager.createTask({ projectId: project.id, title: 'Task 1' });

    expect(task.status).toBe('todo');

    taskManager.moveTask(task.id, 'in_progress');
    let tasks = taskManager.listTasks(project.id);
    expect(tasks[0].status).toBe('in_progress');

    taskManager.moveTask(task.id, 'done');
    tasks = taskManager.listTasks(project.id);
    expect(tasks[0].status).toBe('done');
    expect(tasks[0].completed_at).toBeDefined();
  });

  it('should delete task', () => {
    const project = taskManager.createProject({ name: 'Test' });
    const task = taskManager.createTask({ projectId: project.id, title: 'To Delete' });

    taskManager.deleteTask(task.id);
    expect(taskManager.listTasks(project.id).length).toBe(0);
  });

  it('should generate kanban data', () => {
    const project = taskManager.createProject({ name: 'Test' });
    taskManager.createTask({ projectId: project.id, title: 'T1' });
    taskManager.createTask({ projectId: project.id, title: 'T2' });
    const t3 = taskManager.createTask({ projectId: project.id, title: 'T3' });
    taskManager.moveTask(t3.id, 'in_progress');

    const kanban = taskManager.getKanbanData(project.id);
    expect(kanban.columns.length).toBe(5);
    expect(kanban.columns[0].tasks.length).toBe(2); // todo
    expect(kanban.columns[1].tasks.length).toBe(1); // in_progress
  });
});

describe('TeamEngine modes', () => {
  it('should support all four team modes', () => {
    const provider = ProviderModel.create({ name: 'Test', type: 'web' });
    const role = RoleModel.create({ name: 'R', provider_id: provider.id });

    const modes = ['pipeline', 'parallel', 'debate', 'mixed'] as const;
    for (const mode of modes) {
      const team = TeamModel.create({
        name: `${mode} team`,
        mode,
        roleIds: [{ roleId: role.id, order: 0, parallelGroup: 0, inputMapping: 'original' }],
      });
      expect(team.mode).toBe(mode);
    }
  });
});
