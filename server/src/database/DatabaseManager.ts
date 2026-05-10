import type { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { log, getDbPath } from '../platform';

/** ============================================
 *  数据库管理器 (sql.js — 纯 JS，无需编译)
 *  ============================================ */

export class DatabaseManager {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private inMemory = false;
  private static instance: DatabaseManager | null = null;
  private pendingSaveTimeout: ReturnType<typeof setTimeout> | null = null;
  private autoSaveInterval: ReturnType<typeof setInterval> | null = null;
  private saveInProgress = false;

  private constructor() {
    this.dbPath = getDbPath();
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  async initialize(): Promise<void> {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(new Uint8Array(buffer) as unknown as number[]);
      log.info('数据库已加载:', this.dbPath);
    } else {
      this.db = new SQL.Database();
      log.info('数据库已创建:', this.dbPath);
    }

    // Apply PRAGMA settings for performance and integrity
    this.db.run('PRAGMA journal_mode=WAL;');
    this.db.run('PRAGMA foreign_keys=ON;');
    this.db.run('PRAGMA synchronous=NORMAL;');

    this.runMigrations();
    this.save();
    this.startAutoSave();
  }

  /** 初始化内存数据库（仅用于测试 / 设置流程） */
  async initInMemory(): Promise<void> {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    this.db = new SQL.Database();
    this.inMemory = true;
    this.db.run('PRAGMA foreign_keys=ON;');
    this.db.run('PRAGMA synchronous=NORMAL;');
    this.runMigrations();
  }

  private runMigrations(): void {
    const migrations = [
      // ===== 迁移 001: 基础表 =====
      `
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT DEFAULT '🤖',
        type TEXT DEFAULT 'web' CHECK(type IN ('web', 'api', 'local')),
        is_custom INTEGER DEFAULT 0,
        is_enabled INTEGER DEFAULT 1,
        url TEXT,
        web_config TEXT DEFAULT '{}',
        api_config TEXT DEFAULT '{}',
        local_config TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id),
        title TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );
      `,

      // ===== 迁移 002: AI Team 表 =====
      `
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT DEFAULT '🤖',
        system_prompt TEXT DEFAULT '',
        provider_id TEXT REFERENCES providers(id),
        config TEXT DEFAULT '{}',
        is_custom INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        mode TEXT DEFAULT 'pipeline' CHECK(mode IN ('pipeline', 'parallel', 'debate', 'mixed')),
        config TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS team_roles (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        role_id TEXT NOT NULL REFERENCES roles(id),
        role_order INTEGER DEFAULT 0,
        parallel_group INTEGER DEFAULT 0,
        input_mapping TEXT DEFAULT 'original' CHECK(input_mapping IN ('original', 'previous', 'all_previous')),
        UNIQUE(team_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS team_runs (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id),
        input TEXT NOT NULL,
        status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'stopped')),
        final_output TEXT DEFAULT '',
        started_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS team_run_outputs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES team_runs(id) ON DELETE CASCADE,
        role_id TEXT NOT NULL,
        role_name TEXT NOT NULL,
        input_text TEXT DEFAULT '',
        output_text TEXT DEFAULT '',
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'done', 'error')),
        error_text TEXT DEFAULT '',
        started_at TEXT,
        completed_at TEXT
      );
      `,

      // ===== 迁移 003: 子任务管理表 =====
      `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'archived')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sub_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES sub_tasks(id),
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'review', 'done', 'cancelled')),
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
        assignee_role_id TEXT REFERENCES roles(id),
        assignee_provider_id TEXT REFERENCES providers(id),
        conversation_id TEXT REFERENCES conversations(id),
        task_order INTEGER DEFAULT 0,
        due_date TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      `,

      // ===== 迁移 004: 索引 =====
      `
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_provider ON conversations(provider_id);
      CREATE INDEX IF NOT EXISTS idx_team_roles_team ON team_roles(team_id);
      CREATE INDEX IF NOT EXISTS idx_team_runs_team ON team_runs(team_id);
      CREATE INDEX IF NOT EXISTS idx_team_run_outputs_run ON team_run_outputs(run_id);
      CREATE INDEX IF NOT EXISTS idx_sub_tasks_project ON sub_tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_sub_tasks_parent ON sub_tasks(parent_id);
      CREATE INDEX IF NOT EXISTS idx_sub_tasks_status ON sub_tasks(status);
      `,

      // ===== 迁移 005: FTS5 全文搜索（sql.js/WASM 可能不支持，失败时静默跳过） =====
      `
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content,
        conversation_id UNINDEXED,
        role UNINDEXED,
        created_at UNINDEXED,
        content=messages,
        content_rowid=rowid
      );
      `,

      // ===== 迁移 006: Team 聊天消息表 =====
      `
      CREATE TABLE IF NOT EXISTS team_chat_messages (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        role_id TEXT,
        role_name TEXT,
        role_icon TEXT DEFAULT '🤖',
        role TEXT NOT NULL DEFAULT 'assistant' CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL DEFAULT '',
        status TEXT DEFAULT 'done' CHECK(status IN ('streaming', 'done', 'error')),
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_team_chat_messages_team ON team_chat_messages(team_id);
      `,

      // ===== 迁移 007: Team 角色可选关联提供商（用于覆盖角色默认的 provider_id） =====
      `ALTER TABLE team_roles ADD COLUMN provider_override TEXT REFERENCES providers(id);`,

      // ===== 迁移 008: 支持每个角色多个提供商 =====
      `ALTER TABLE team_roles ADD COLUMN provider_overrides TEXT DEFAULT '[]';`,

      // ===== 迁移 009: Team 角色关联固定对话（conversation_id） =====
      `ALTER TABLE team_roles ADD COLUMN conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL;`,

      // ===== 迁移 010: Conversation 绑定网页端真实对话 URL（用于 web 自动化 provider 的会话同步） =====
      `ALTER TABLE conversations ADD COLUMN web_url TEXT;`,

      // ===== 迁移 011: 对话级自动调度开关 =====
      `ALTER TABLE conversations ADD COLUMN auto_dispatch INTEGER DEFAULT 0;`,

      // ===== 迁移 012: 消息携带调度信息 =====
      `ALTER TABLE messages ADD COLUMN dispatched_role_id TEXT;`,
      `ALTER TABLE messages ADD COLUMN dispatch_reason TEXT;`,

      // ===== 迁移 013: provider 能力元数据（用于多模型编排的档位路由） =====
      `ALTER TABLE providers ADD COLUMN capabilities TEXT DEFAULT '{}';`,

      // ===== 迁移 014: 消息嵌入向量（语义记忆） =====
      `ALTER TABLE messages ADD COLUMN embedding TEXT;`,

      // ===== 迁移 015: Agent 模式 =====
      `ALTER TABLE conversations ADD COLUMN agent_mode INTEGER DEFAULT 0;`,
      `ALTER TABLE conversations ADD COLUMN agent_system_prompt TEXT;`,
    ];

    let migrationIndex = 0;
    for (const migration of migrations) {
      migrationIndex++;
      try {
        this.db!.run(migration);
      } catch (err) {
        // FTS5 迁移可能因 sql.js/WASM 不支持而失败，静默跳过
        if (migration.toLowerCase().includes('fts5') || migration.toLowerCase().includes('virtual table')) {
          log.warn('FTS5 全文搜索不可用，将使用内存反向索引作为替代:', (err as Error).message);
          continue;
        }
        // ALTER TABLE ADD COLUMN 重复执行时静默跳过
        if (migration.includes('ALTER TABLE') && (err as Error).message?.includes('duplicate column')) {
          log.warn(`迁移 ${migrationIndex} 列已存在，跳过:`, (err as Error).message);
          continue;
        }
        // 其他迁移失败则中断启动
        log.error(`迁移 ${migrationIndex} 执行失败:`, err);
        throw new Error(`数据库迁移失败 (迁移 ${migrationIndex}): ${(err as Error).message}`);
      }
    }

    log.info('数据库迁移已完成');
  }

  save(): void {
    if (!this.db || this.inMemory) return;
    // Debounce: clear any pending save and schedule a new one
    if (this.pendingSaveTimeout !== null) {
      clearTimeout(this.pendingSaveTimeout);
    }
    this.pendingSaveTimeout = setTimeout(() => {
      this.pendingSaveTimeout = null;
      this.writeToDisk();
    }, 200);
  }

  private writeToDisk(): void {
    if (!this.db || this.inMemory || this.saveInProgress) return;
    try {
      this.saveInProgress = true;
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (err) {
      log.error('数据库写入失败:', err);
    } finally {
      this.saveInProgress = false;
    }
  }

  private startAutoSave(): void {
    // Save every 5 seconds as a safety net (in addition to debounced saves)
    this.autoSaveInterval = setInterval(() => {
      this.writeToDisk();
    }, 5000);
  }

  getDb(): SqlJsDatabase {
    if (!this.db) throw new Error('数据库未初始化');
    return this.db;
  }

  close(): void {
    // Clear timers
    if (this.pendingSaveTimeout !== null) {
      clearTimeout(this.pendingSaveTimeout);
      this.pendingSaveTimeout = null;
    }
    if (this.autoSaveInterval !== null) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    // Flush final save synchronously
    this.writeToDisk();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
