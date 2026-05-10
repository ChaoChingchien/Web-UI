import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { ProviderModel, ConversationModel, MessageModel, RoleModel, TeamModel, ProjectModel } from '../src/database/models';

let db: DatabaseManager;

beforeEach(async () => {
  db = DatabaseManager.getInstance();
  await db.initInMemory();
});

afterEach(() => {
  try { db.close(); } catch { /* ignore */ }
});

describe('ProviderModel', () => {
  it('should create and find a provider', () => {
    const provider = ProviderModel.create({
      name: 'Test Provider',
      icon: '🤖',
      type: 'api',
      api_config: { baseUrl: 'https://api.test.com', apiKey: 'test-key', model: 'test-model' },
    });
    expect(provider.id).toBeDefined();
    expect(provider.name).toBe('Test Provider');
    expect(provider.type).toBe('api');

    const found = ProviderModel.findById(provider.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Test Provider');
  });

  it('should list all providers', () => {
    ProviderModel.create({ name: 'P1', type: 'web' });
    ProviderModel.create({ name: 'P2', type: 'api' });
    const providers = ProviderModel.findAll();
    expect(providers.length).toBe(2);
  });

  it('should update a provider', () => {
    const provider = ProviderModel.create({ name: 'Old Name', type: 'web' });
    ProviderModel.update(provider.id, { name: 'New Name' });
    const found = ProviderModel.findById(provider.id);
    expect(found!.name).toBe('New Name');
  });

  it('should delete a custom provider', () => {
    const provider = ProviderModel.create({ name: 'To Delete', type: 'web', is_custom: true });
    ProviderModel.delete(provider.id);
    expect(ProviderModel.findById(provider.id)).toBeNull();
  });
});

describe('ConversationModel', () => {
  it('should create and find a conversation', () => {
    const provider = ProviderModel.create({ name: 'Test', type: 'web' });
    const conv = ConversationModel.create(provider.id, 'Test Conversation');
    expect(conv.title).toBe('Test Conversation');
    expect(conv.provider_id).toBe(provider.id);

    const found = ConversationModel.findById(conv.id);
    expect(found).not.toBeNull();
    expect(found!.title).toBe('Test Conversation');
  });

  it('should list conversations by provider', () => {
    const p1 = ProviderModel.create({ name: 'P1', type: 'web' });
    const p2 = ProviderModel.create({ name: 'P2', type: 'web' });
    ConversationModel.create(p1.id, 'C1');
    ConversationModel.create(p1.id, 'C2');
    ConversationModel.create(p2.id, 'C3');

    expect(ConversationModel.findAll(p1.id).length).toBe(2);
    expect(ConversationModel.findAll(p2.id).length).toBe(1);
  });

  it('should delete a conversation and its messages', () => {
    const provider = ProviderModel.create({ name: 'Test', type: 'web' });
    const conv = ConversationModel.create(provider.id, 'To Delete');
    MessageModel.create(conv.id, 'user', 'hello');
    MessageModel.create(conv.id, 'assistant', 'hi');

    ConversationModel.delete(conv.id);
    expect(ConversationModel.findById(conv.id)).toBeNull();
    expect(MessageModel.findByConversation(conv.id).length).toBe(0);
  });
});

describe('MessageModel', () => {
  it('should create and find messages', () => {
    const provider = ProviderModel.create({ name: 'Test', type: 'web' });
    const conv = ConversationModel.create(provider.id, 'Test');

    MessageModel.create(conv.id, 'user', 'Hello');
    MessageModel.create(conv.id, 'assistant', 'Hi there');

    const messages = MessageModel.findByConversation(conv.id);
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  it('should search messages by content', () => {
    const provider = ProviderModel.create({ name: 'Test', type: 'web' });
    const conv = ConversationModel.create(provider.id, 'Test');
    MessageModel.create(conv.id, 'user', 'Hello world');
    MessageModel.create(conv.id, 'assistant', 'Goodbye');

    const results = MessageModel.search('world');
    expect(results.length).toBe(1);
    expect(results[0].content).toBe('Hello world');
  });
});

describe('RoleModel', () => {
  it('should create and find a role', () => {
    const provider = ProviderModel.create({ name: 'Test', type: 'web' });
    const role = RoleModel.create({
      name: 'Researcher',
      icon: '🔍',
      system_prompt: 'You are a researcher',
      provider_id: provider.id,
    });
    expect(role.name).toBe('Researcher');
    expect(role.is_custom).toBe(true);

    const found = RoleModel.findById(role.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Researcher');
  });

  it('should update a role', () => {
    const provider = ProviderModel.create({ name: 'Test', type: 'web' });
    const role = RoleModel.create({ name: 'Old', provider_id: provider.id });
    RoleModel.update(role.id, { name: 'New', icon: '🎯' });
    const found = RoleModel.findById(role.id);
    expect(found!.name).toBe('New');
    expect(found!.icon).toBe('🎯');
  });

  it('should delete a role', () => {
    const provider = ProviderModel.create({ name: 'Test', type: 'web' });
    const role = RoleModel.create({ name: 'To Delete', provider_id: provider.id });
    RoleModel.delete(role.id);
    expect(RoleModel.findById(role.id)).toBeNull();
  });
});

describe('TeamModel', () => {
  it('should create a team with roles', () => {
    const provider = ProviderModel.create({ name: 'Test', type: 'web' });
    const role1 = RoleModel.create({ name: 'R1', provider_id: provider.id });
    const role2 = RoleModel.create({ name: 'R2', provider_id: provider.id });

    const team = TeamModel.create({
      name: 'Test Team',
      description: 'A test team',
      mode: 'pipeline',
      roleIds: [
        { roleId: role1.id, order: 0, parallelGroup: 0, inputMapping: 'original' },
        { roleId: role2.id, order: 1, parallelGroup: 1, inputMapping: 'previous' },
      ],
    });
    expect(team.name).toBe('Test Team');
    expect(team.mode).toBe('pipeline');

    const found = TeamModel.findById(team.id);
    expect(found).not.toBeNull();
    expect(found!.roles.length).toBe(2);
  });

  it('should list all teams with roles', () => {
    const provider = ProviderModel.create({ name: 'Test', type: 'web' });
    const role = RoleModel.create({ name: 'R', provider_id: provider.id });
    TeamModel.create({ name: 'T1', mode: 'pipeline', roleIds: [{ roleId: role.id, order: 0, parallelGroup: 0, inputMapping: 'original' }] });
    TeamModel.create({ name: 'T2', mode: 'parallel', roleIds: [{ roleId: role.id, order: 0, parallelGroup: 0, inputMapping: 'original' }] });

    const teams = TeamModel.findAll();
    expect(teams.length).toBe(2);
  });
});

describe('ProjectModel', () => {
  it('should create and find a project', () => {
    const project = ProjectModel.create({ name: 'Test Project', description: 'A test project' });
    expect(project.name).toBe('Test Project');
    expect(project.status).toBe('active');

    const found = ProjectModel.findById(project.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Test Project');
  });

  it('should list projects', () => {
    ProjectModel.create({ name: 'P1' });
    ProjectModel.create({ name: 'P2' });
    expect(ProjectModel.findAll().length).toBe(2);
  });

  it('should update project status', () => {
    const project = ProjectModel.create({ name: 'Test' });
    ProjectModel.update(project.id, { status: 'completed' });
    expect(ProjectModel.findById(project.id)!.status).toBe('completed');
  });

  it('should delete project and its tasks', () => {
    const project = ProjectModel.create({ name: 'To Delete' });
    ProjectModel.delete(project.id);
    expect(ProjectModel.findById(project.id)).toBeNull();
  });
});
