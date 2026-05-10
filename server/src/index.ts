import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import { SERVER_CONFIG, log, getDbPath, getDataPath } from './platform';
import { DatabaseManager } from './database/DatabaseManager';
import { ProviderModel, RoleModel } from './database/models';
import { createBuiltinProviders } from './providers/builtins';
import { createBuiltinRoles } from './providers/builtins/roles';
import { registerRoutes } from './routes';
import { setupWebSocket } from './ws';
import type { AIProvider, ProviderCapabilities } from '@shared/types';

/** ============================================
 *  Web-AI 后端服务器入口
 *  ============================================ */

async function main(): Promise<void> {
  log.info(`Web-AI 服务器启动中...`);
  log.info(`数据目录: ${getDataPath()}`);

  // 1. 初始化数据库
  const dbManager = DatabaseManager.getInstance();
  await dbManager.initialize();
  log.info('数据库已初始化');

  // 2. 初始化内置提供商（首次运行 + 后续新增）
  const builtins = createBuiltinProviders();
  const existingProviders = ProviderModel.findAll();
  if (existingProviders.length === 0) {
    // 首次运行：全部创建
    for (const provider of builtins) {
      ProviderModel.create(provider);
    }
    log.info(`已初始化 ${builtins.length} 个内置 AI 提供商`);
  } else {
    // 后续运行：补充新添加的提供商 + 更新已有内置提供商的配置
    const existingIds = new Set(existingProviders.map(p => p.id));
    let added = 0;
    let updated = 0;
    for (const provider of builtins) {
      if (!existingIds.has(provider.id)) {
        ProviderModel.create(provider);
        added++;
      } else {
        // 同步内置配置中的 modeSelector、modelSelector、toggles 字段
        const existing = existingProviders.find(p => p.id === provider.id);
        if (existing && !existing.is_custom && provider.web_config) {
          const mergedConfig = { ...existing.web_config } as Record<string, unknown>;
          let changed = false;
          for (const key of ['modeSelector', 'modelSelector', 'toggles', 'conversationStart', 'selectors'] as const) {
            const builtinVal = provider.web_config[key];
            const existingVal = mergedConfig[key];
            if (JSON.stringify(builtinVal) !== JSON.stringify(existingVal)) {
              if (builtinVal === undefined) {
                delete mergedConfig[key];
              } else {
                mergedConfig[key] = builtinVal;
              }
              changed = true;
            }
          }
          if (provider.web_config.waitStrategy && !mergedConfig.waitStrategy) {
            mergedConfig.waitStrategy = provider.web_config.waitStrategy;
            changed = true;
          }
          if (provider.web_config.waitOptions && !mergedConfig.waitOptions) {
            mergedConfig.waitOptions = provider.web_config.waitOptions;
            changed = true;
          }
          if (changed) {
            ProviderModel.update(provider.id, { web_config: mergedConfig as any });
            updated++;
          }
        }
      }
    }
    if (added > 0) log.info(`新增 ${added} 个内置 AI 提供商`);
    if (updated > 0) log.info(`已更新 ${updated} 个内置提供商的配置`);
  }

  // 2b. 回填内置 provider 的 capabilities 默认值（用于多模型编排的档位路由）
  const BUILTIN_CAPABILITIES: Record<string, ProviderCapabilities> = {
    chatgpt:  { best_for_levels: ['L1', 'L2'], cost_tier: 'medium', speed_tier: 'medium', strengths: ['reasoning', 'coding', 'writing'], context_k: 128 },
    claude:   { best_for_levels: ['L1', 'L2'], cost_tier: 'medium', speed_tier: 'medium', strengths: ['reasoning', 'coding', 'long_context'], context_k: 200 },
    gemini:   { best_for_levels: ['L0', 'L1'], cost_tier: 'low',    speed_tier: 'fast',   strengths: ['multilingual', 'long_context'], context_k: 1000 },
    deepseek: { best_for_levels: ['L1', 'L2'], cost_tier: 'low',    speed_tier: 'medium', strengths: ['reasoning', 'coding'], context_k: 64 },
    kimi:     { best_for_levels: ['L1'],       cost_tier: 'low',    speed_tier: 'fast',   strengths: ['long_context', 'multilingual'], context_k: 200 },
    tongyi:   { best_for_levels: ['L0', 'L1'], cost_tier: 'low',    speed_tier: 'fast',   strengths: ['multilingual'], context_k: 32 },
    doubao:   { best_for_levels: ['L0', 'L1'], cost_tier: 'low',    speed_tier: 'fast',   strengths: ['multilingual'], context_k: 32 },
    glm:      { best_for_levels: ['L0', 'L1'], cost_tier: 'low',    speed_tier: 'medium', strengths: ['multilingual'], context_k: 128 },
    longcat:  { best_for_levels: ['L0'],       cost_tier: 'low',    speed_tier: 'fast',   strengths: ['multilingual'], context_k: 32 },
  };

  const allProvidersAfterInit = ProviderModel.findAll();
  let backfilled = 0;
  for (const p of allProvidersAfterInit) {
    if (p.capabilities && Object.keys(p.capabilities).length > 0) continue;
    const defaults = BUILTIN_CAPABILITIES[p.id];
    if (defaults) {
      try {
        ProviderModel.update(p.id, { capabilities: defaults } as Partial<AIProvider>);
        backfilled++;
      } catch (err) {
        log.warn(`回填 ${p.id} capabilities 失败:`, err);
      }
    } else if (!p.is_custom) {
      // 非自定义但未知的 provider：给 L1 兜底
      try {
        ProviderModel.update(p.id, { capabilities: { best_for_levels: ['L1'] } } as Partial<AIProvider>);
        backfilled++;
      } catch { /* ignore */ }
    }
  }
  if (backfilled > 0) log.info(`已回填 ${backfilled} 个 provider 的 capabilities`);

  // 3. 初始化内置角色
  const existingRolesRaw = RoleModel.findAll();

  // 3a. 一次性合并迁移：历史上 RoleModel.create 忽略传入的 id，导致每个内置角色
  //     既有一条正确的静态 id 行（role_xxx），又有一条遗留 UUID 孤儿行。UUID 行因为
  //     不在前端的 ROLE_CATEGORY_MAP 中会全部 fallback 到"商务"，造成视觉重复。
  //     这里按 name 分组，合并到静态 id，同步外键引用，并删除孤儿。
  if (existingRolesRaw.length > 0) {
    const db = dbManager.getDb();
    const builtinTemplates = createBuiltinRoles();
    let merged = 0;
    for (const target of builtinTemplates) {
      // 该内置模板名字对应的所有非自定义 DB 行（可能 0、1、2 行）
      const dupes = existingRolesRaw.filter(
        (r) => !(r as any).is_custom && r.name === target.name
      );
      if (dupes.length === 0) continue;

      const canonical = dupes.find((r) => r.id === target.id);
      let keptId: string;
      // 需要被合并掉（外键改指、最终删除）的孤儿 id 集合
      const staleIds: string[] = [];

      if (canonical) {
        // 已有静态 id 行，其它同名非自定义行全部视为孤儿
        keptId = canonical.id;
        for (const d of dupes) if (d.id !== canonical.id) staleIds.push(d.id);
      } else {
        // 没有静态 id 行：挑第一个孤儿改名为静态 id；其余（若有）再合并
        const [first, ...rest] = dupes;
        try {
          db.run('UPDATE roles SET id = ? WHERE id = ?', [target.id, first.id]);
          // 外键同步
          db.run('UPDATE team_roles SET role_id = ? WHERE role_id = ?', [target.id, first.id]);
          db.run('UPDATE sub_tasks SET assignee_role_id = ? WHERE assignee_role_id = ?', [target.id, first.id]);
        } catch (err) {
          log.warn(`角色 ${first.id} → ${target.id} 改名失败，跳过:`, err);
          continue;
        }
        keptId = target.id;
        for (const d of rest) staleIds.push(d.id);
      }

      // 合并每个 stale 行：把其外键引用改指到 keptId，然后删除自己
      for (const staleId of staleIds) {
        try {
          // 处理 UNIQUE(team_id, role_id)：同团队已绑过 canonical 的，stale 那份直接删
          db.run(
            `DELETE FROM team_roles
             WHERE role_id = ?
               AND team_id IN (SELECT team_id FROM team_roles WHERE role_id = ?)`,
            [staleId, keptId]
          );
          db.run('UPDATE team_roles SET role_id = ? WHERE role_id = ?', [keptId, staleId]);
          db.run('UPDATE sub_tasks SET assignee_role_id = ? WHERE assignee_role_id = ?', [keptId, staleId]);
          db.run('DELETE FROM roles WHERE id = ?', [staleId]);
          merged++;
        } catch (err) {
          log.warn(`合并角色 ${staleId} → ${keptId} 失败:`, err);
        }
      }
    }
    if (merged > 0) {
      dbManager.save();
      log.info(`已合并 ${merged} 个重复内置角色`);
    }
  }

  const existingRoles = RoleModel.findAll();
  if (existingRoles.length === 0) {
    const roles = createBuiltinRoles();
    for (const role of roles) {
      RoleModel.create(role);
    }
    log.info(`已初始化 ${roles.length} 个内置 AI 角色`);
  } else {
    // 补充新增的内置角色 + 更新非自定义角色的 system_prompt
    const existingRoleIds = new Set(existingRoles.map((r: any) => r.id));
    const builtinRoles = createBuiltinRoles();
    let added = 0;
    let updated = 0;
    for (const role of builtinRoles) {
      try {
        if (!existingRoleIds.has(role.id)) {
          RoleModel.create(role);
          added++;
        } else {
          const existing = existingRoles.find((r: any) => r.id === role.id);
          if (existing && !(existing as any).is_custom) {
            const changes: Record<string, unknown> = {};
            if (existing.system_prompt !== role.system_prompt) changes.system_prompt = role.system_prompt;
            // 同步 provider_id：内置角色现在不再预设默认模型（空字符串），
            // 清理历史数据中遗留的默认 provider。
            if ((existing.provider_id || '') !== (role.provider_id || '')) {
              changes.provider_id = role.provider_id;
            }
            if (Object.keys(changes).length > 0) {
              RoleModel.update(role.id, changes);
              updated++;
            }
          }
        }
      } catch (err) {
        // 单个角色同步失败不影响其他角色；记录日志后继续
        log.warn(`内置角色 ${role.id} 同步失败，跳过:`, err);
      }
    }
    if (added > 0) log.info(`新增 ${added} 个内置 AI 角色`);
    if (updated > 0) log.info(`已更新 ${updated} 个内置角色的 system_prompt`);
  }

  // 4. 创建 Express 应用
  const app = express();
  app.use(cors({ origin: SERVER_CONFIG.corsOrigin }));
  app.use(express.json());

  // 5. 注册 HTTP 路由
  registerRoutes(app);
  log.info('HTTP 路由已注册');

  // 6. 创建 HTTP 服务器
  const server = http.createServer(app);

  // 7. 附加 WebSocket 服务器
  const wss = new WebSocketServer({ server, path: '/ws' });
  setupWebSocket(wss);

  // 8. 启动
  server.listen(SERVER_CONFIG.port, () => {
    log.info(`服务器运行在 http://localhost:${SERVER_CONFIG.port}`);
    log.info(`WebSocket 端点: ws://localhost:${SERVER_CONFIG.port}/ws`);
  });

  // 9. 优雅关闭
  const shutdown = async () => {
    log.info('收到关闭信号，正在清理...');
    wss.close();
    server.close();
    const { BrowserManager } = await import('./browser/BrowserManager');
    await BrowserManager.getInstance().close();
    dbManager.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log.error('服务器启动失败:', err);
  process.exit(1);
});
