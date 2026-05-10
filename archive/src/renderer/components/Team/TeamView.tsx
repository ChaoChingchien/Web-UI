import React, { useState, useEffect, useCallback } from 'react';
import type { AITeam, AITeamWithRoles, AIRole, TeamMode, TeamLogEvent } from '@shared/types';
import './TeamView.css';

export const TeamView: React.FC = () => {
  const [teams, setTeams] = useState<AITeamWithRoles[]>([]);
  const [roles, setRoles] = useState<AIRole[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [runInput, setRunInput] = useState('');
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<TeamLogEvent[]>([]);
  const [result, setResult] = useState('');

  // 创建 Team 表单
  const [newTeam, setNewTeam] = useState({ name: '', description: '', mode: 'pipeline' as TeamMode, roleIds: [] as string[] });
  const [roleInputMappings, setRoleInputMappings] = useState<Record<string, 'original' | 'previous' | 'all_previous'>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [t, r] = await Promise.all([window.api.team.list(), window.api.role.list()]);
    setTeams(t);
    setRoles(r);
  };

  // 监听 Team 日志
  useEffect(() => {
    const unsub = window.api.team.onLog((event) => {
      setLogs((prev) => [...prev, event]);
      if (event.type === 'team_complete') {
        setRunning(false);
        setResult(event.content || '');
      }
      if (event.type === 'team_error') {
        setRunning(false);
      }
    });
    return () => { unsub(); };
  }, []);

  const handleCreateTeam = async () => {
    const roleEntries = newTeam.roleIds.map((roleId, i) => ({
      roleId,
      order: i,
      parallelGroup: newTeam.mode === 'parallel' ? 0 : i,
      inputMapping: roleInputMappings[roleId] || (newTeam.mode === 'pipeline' ? 'previous' : 'original'),
    }));

    await window.api.team.create({
      name: newTeam.name,
      description: newTeam.description,
      mode: newTeam.mode,
      roleIds: roleEntries,
    });

    setShowCreate(false);
    setNewTeam({ name: '', description: '', mode: 'pipeline', roleIds: [] });
    setRoleInputMappings({});
    loadData();
  };

  const handleRunTeam = async () => {
    if (!selectedTeam || !runInput.trim() || running) return;
    setRunning(true);
    setLogs([]);
    setResult('');

    try {
      await window.api.team.run(selectedTeam, runInput);
    } catch (err) {
      setRunning(false);
      setLogs((prev) => [...prev, { runId: '', type: 'team_error', error: String(err) }]);
    }
  };

  const selectedTeamData = teams.find((t) => t.id === selectedTeam) as AITeamWithRoles | undefined;

  return (
    <div className="team-view">
      {/* 左侧：Team 列表 */}
      <div className="team-sidebar">
        <div className="team-sidebar-header">
          <h3>🤖 AI Teams</h3>
          <button className="btn-add" onClick={() => setShowCreate(true)}>+ 新建</button>
        </div>
        <div className="team-list">
          {teams.map((team) => (
            <div
              key={team.id}
              className={`team-item ${selectedTeam === team.id ? 'active' : ''}`}
              onClick={() => setSelectedTeam(team.id)}
            >
              <span className="team-name">{team.name}</span>
              <span className="team-mode">{team.mode}</span>
            </div>
          ))}
          {teams.length === 0 && <div className="empty-state">暂无 Team，点击新建</div>}
        </div>
      </div>

      {/* 右侧：Team 详情 / 执行 */}
      <div className="team-content">
        {!selectedTeamData ? (
          <div className="team-empty">
            <span className="empty-icon">👥</span>
            <h2>选择一个 AI Team</h2>
            <p>或创建一个新的 Team 来开始协作</p>
          </div>
        ) : (
          <>
            <div className="team-detail-header">
              <div>
                <h2>{selectedTeamData.name}</h2>
                <p className="team-desc">{selectedTeamData.description}</p>
                <span className="team-mode-badge">{selectedTeamData.mode}</span>
              </div>
            </div>

            {/* 角色列表 */}
            <div className="team-roles">
              <h4>角色成员</h4>
              <div className="role-chips">
                {selectedTeamData.roles && selectedTeamData.roles.length > 0
                  ? selectedTeamData.roles.map((teamRole) => (
                      <span key={teamRole.role_id} className="role-chip">
                        {teamRole.role.icon} {teamRole.role.name}
                        <small className="mapping-hint">({teamRole.input_mapping})</small>
                      </span>
                    ))
                  : <span className="empty-hint">无角色</span>
                }
              </div>
            </div>

            {/* 执行区 */}
            <div className="team-run-area">
              <h4>执行任务</h4>
              <div className="run-input-area">
                <textarea
                  className="run-input"
                  value={runInput}
                  onChange={(e) => setRunInput(e.target.value)}
                  placeholder="输入任务描述..."
                  rows={3}
                  disabled={running}
                />
                <button
                  className="btn-run"
                  onClick={handleRunTeam}
                  disabled={!runInput.trim() || running}
                >
                  {running ? '⏳ 执行中...' : '🚀 开始执行'}
                </button>
              </div>

              {/* 执行日志 */}
              {logs.length > 0 && (
                <div className="team-logs">
                  <h4>执行日志</h4>
                  {logs.map((log, i) => (
                    <div key={i} className={`log-item log-${log.type}`}>
                      {log.type === 'role_start' && <span>▶️ {log.roleName} 开始执行...</span>}
                      {log.type === 'role_complete' && <span>✅ {log.roleName} 完成</span>}
                      {log.type === 'role_error' && <span>❌ {log.roleName} 错误: {log.error}</span>}
                      {log.type === 'team_complete' && <span>🎉 Team 执行完成!</span>}
                      {log.type === 'team_error' && <span>💥 Team 执行失败: {log.error}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* 结果 */}
              {result && (
                <div className="team-result">
                  <h4>最终结果</h4>
                  <pre className="result-content">{result}</pre>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 创建 Team 弹窗 */}
      {showCreate && (
        <div className="team-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="team-modal" onClick={(e) => e.stopPropagation()}>
            <h3>创建 AI Team</h3>

            <div className="form-group">
              <label>Team 名称</label>
              <input
                value={newTeam.name}
                onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                placeholder="如：内容创作团队"
              />
            </div>

            <div className="form-group">
              <label>描述</label>
              <input
                value={newTeam.description}
                onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                placeholder="简要描述这个团队的用途"
              />
            </div>

            <div className="form-group">
              <label>协作模式</label>
              <select value={newTeam.mode} onChange={(e) => setNewTeam({ ...newTeam, mode: e.target.value as TeamMode })}>
                <option value="pipeline">🔄 流水线 - 顺序执行</option>
                <option value="parallel">⚡ 并行 - 同时执行</option>
                <option value="debate">💬 讨论 - 多轮辩论</option>
                <option value="mixed">🔀 混合 - 自定义编排</option>
              </select>
            </div>

            <div className="form-group">
              <label>选择角色（按顺序）</label>
              <div className="role-selector">
                {roles.map((role) => (
                  <div key={role.id} className="role-select-item">
                    <label className="role-checkbox">
                      <input
                        type="checkbox"
                        checked={newTeam.roleIds.includes(role.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewTeam({ ...newTeam, roleIds: [...newTeam.roleIds, role.id] });
                          } else {
                            setNewTeam({ ...newTeam, roleIds: newTeam.roleIds.filter((id) => id !== role.id) });
                          }
                        }}
                      />
                      <span>{role.icon} {role.name}</span>
                    </label>
                    {newTeam.roleIds.includes(role.id) && (
                      <select
                        className="input-mapping-select"
                        value={roleInputMappings[role.id] || (newTeam.mode === 'pipeline' ? 'previous' : 'original')}
                        onChange={(e) => setRoleInputMappings({ ...roleInputMappings, [role.id]: e.target.value as 'original' | 'previous' | 'all_previous' })}
                      >
                        <option value="original">📥 原始输入</option>
                        <option value="previous">⬅️ 上一角色输出</option>
                        <option value="all_previous">📚 所有前面角色输出</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setShowCreate(false)}>取消</button>
              <button
                className="btn-confirm"
                onClick={handleCreateTeam}
                disabled={!newTeam.name || newTeam.roleIds.length < 2}
              >
                创建 Team
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
