import type { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import log from 'electron-log';

/** ============================================
 *  数据库管理器 (sql.js — 纯 JS，无需编译)
 *  ============================================ */

export class DatabaseManager {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private inMemory = false;
  private static instance: DatabaseManager | null = null;

  private constructor() {
    const userDataPath = app.getPath('userData');
    this.dbPath = path.join(userDataPath, 'web-ai.db');
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

    this.runMigrations();
    this.save();
  }

  /** 初始化内存数据库（仅用于测试） */
  async initInMemory(): Promise<void> {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    this.db = new SQL.Database();
    this.inMemory = true;
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
    ];

    for (const migration of migrations) {
      try {
        this.db!.run(migration);
      } catch (err) {
        log.error('迁移执行失败:', err);
      }
    }

    log.info('数据库迁移已完成');
  }

  save(): void {
    if (!this.db || this.inMemory) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  getDb(): SqlJsDatabase {
    if (!this.db) throw new Error('数据库未初始化');
    return this.db;
  }

  close(): void {
    this.save();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
