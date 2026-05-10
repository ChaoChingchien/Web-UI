import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseManager } from '../src/main/database/DatabaseManager';
import { ProviderModel, RoleModel, TeamModel } from '../src/main/database/models';
import { PipelineExecutor } from '../src/main/team/PipelineExecutor';
import { ParallelExecutor } from '../src/main/team/ParallelExecutor';
import { DebateExecutor } from '../src/main/team/DebateExecutor';

let db: DatabaseManager;

beforeEach(async () => {
  db = DatabaseManager.getInstance();
  await db.initInMemory();
});

describe('PipelineExecutor', () => {
  it('should create instance', () => {
    const executor = new PipelineExecutor();
    expect(executor).toBeDefined();
  });

  it('should have run method', () => {
    const executor = new PipelineExecutor();
    expect(typeof executor.run).toBe('function');
  });
});

describe('ParallelExecutor', () => {
  it('should create instance', () => {
    const executor = new ParallelExecutor();
    expect(executor).toBeDefined();
  });

  it('should have run method', () => {
    const executor = new ParallelExecutor();
    expect(typeof executor.run).toBe('function');
  });
});

describe('DebateExecutor', () => {
  it('should create instance', () => {
    const executor = new DebateExecutor();
    expect(executor).toBeDefined();
  });

  it('should have run method', () => {
    const executor = new DebateExecutor();
    expect(typeof executor.run).toBe('function');
  });
});

describe('Team mode coverage', () => {
  it('should create teams with all four modes', () => {
    const provider = ProviderModel.create({ name: 'Test', type: 'api', api_config: { baseUrl: 'https://test.com', apiKey: 'k', model: 'm' } });
    const role = RoleModel.create({ name: 'R', provider_id: provider.id });

    const modes = ['pipeline', 'parallel', 'debate', 'mixed'] as const;
    for (const mode of modes) {
      const team = TeamModel.create({
        name: `${mode} team`,
        mode,
        roleIds: [{ roleId: role.id, order: 0, parallelGroup: 0, inputMapping: 'original' }],
      });
      expect(team.mode).toBe(mode);
      expect(team.id).toBeDefined();
    }
  });

  it('should create team with multiple roles and inputMappings', () => {
    const provider = ProviderModel.create({ name: 'Test', type: 'api', api_config: { baseUrl: 'https://test.com', apiKey: 'k', model: 'm' } });
    const r1 = RoleModel.create({ name: 'R1', provider_id: provider.id });
    const r2 = RoleModel.create({ name: 'R2', provider_id: provider.id });
    const r3 = RoleModel.create({ name: 'R3', provider_id: provider.id });

    const team = TeamModel.create({
      name: 'Multi-role team',
      mode: 'mixed',
      roleIds: [
        { roleId: r1.id, order: 0, parallelGroup: 0, inputMapping: 'original' },
        { roleId: r2.id, order: 1, parallelGroup: 0, inputMapping: 'previous' },
        { roleId: r3.id, order: 2, parallelGroup: 1, inputMapping: 'all_previous' },
      ],
    });

    const found = TeamModel.findById(team.id);
    expect(found).not.toBeNull();
    expect(found!.roles.length).toBe(3);
    expect(found!.roles[0].input_mapping).toBe('original');
    expect(found!.roles[1].input_mapping).toBe('previous');
    expect(found!.roles[2].input_mapping).toBe('all_previous');
  });
});

describe('Role CRUD', () => {
  it('should create role with config', () => {
    const provider = ProviderModel.create({ name: 'Test', type: 'api', api_config: { baseUrl: 'https://test.com', apiKey: 'k', model: 'm' } });
    const role = RoleModel.create({
      name: 'Test Role',
      icon: '🎯',
      system_prompt: 'You are a test role',
      provider_id: provider.id,
      config: { temperature: 0.5, max_tokens: 2048 },
    });
    expect(role.config.temperature).toBe(0.5);
    expect(role.config.max_tokens).toBe(2048);

    const found = RoleModel.findById(role.id);
    expect(found!.icon).toBe('🎯');
    expect(found!.system_prompt).toBe('You are a test role');
  });

  it('should update role config', () => {
    const provider = ProviderModel.create({ name: 'Test', type: 'api', api_config: { baseUrl: 'https://test.com', apiKey: 'k', model: 'm' } });
    const role = RoleModel.create({ name: 'Test', provider_id: provider.id });
    RoleModel.update(role.id, { config: { temperature: 1.0, max_tokens: 8192 } });
    const found = RoleModel.findById(role.id);
    expect(found!.config.temperature).toBe(1.0);
    expect(found!.config.max_tokens).toBe(8192);
  });
});
