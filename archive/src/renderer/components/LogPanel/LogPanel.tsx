import React, { useState, useEffect, useRef, useCallback } from 'react';
import './LogPanel.css';

interface LogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: string;
}

interface LogPanelProps {
  onClose: () => void;
}

export const LogPanel: React.FC<LogPanelProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 加载历史日志
    window.api.log.get().then(setLogs);
    // 监听新日志
    const unsub = window.api.log.onNew((entry) => {
      setLogs((prev) => {
        const next = [...prev, entry];
        if (next.length > 500) return next.slice(-500);
        return next;
      });
    });
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleClear = useCallback(() => {
    window.api.log.clear();
    setLogs([]);
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (filter !== 'all' && log.level !== filter) return false;
    if (search && !log.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const levelIcon = (level: string) => {
    switch (level) {
      case 'info': return 'ℹ️';
      case 'warn': return '⚠️';
      case 'error': return '❌';
      case 'debug': return '🔧';
      default: return '📝';
    }
  };

  const levelClass = (level: string) => `log-item log-${level}`;

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
    } catch {
      return ts;
    }
  };

  return (
    <div className="log-panel-overlay" onClick={onClose}>
      <div className="log-panel" onClick={(e) => e.stopPropagation()}>
        <div className="log-panel-header">
          <h3>📋 应用日志</h3>
          <div className="log-panel-controls">
            <input
              type="text"
              className="log-search"
              placeholder="搜索日志..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="log-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="error">错误</option>
              <option value="warn">警告</option>
              <option value="info">信息</option>
              <option value="debug">调试</option>
            </select>
            <label className="log-autoscroll">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              自动滚动
            </label>
            <button className="log-btn-clear" onClick={handleClear}>清空</button>
            <button className="log-btn-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="log-panel-stats">
          <span>共 {logs.length} 条</span>
          <span>显示 {filteredLogs.length} 条</span>
          <span className="log-count-error">错误: {logs.filter(l => l.level === 'error').length}</span>
          <span className="log-count-warn">警告: {logs.filter(l => l.level === 'warn').length}</span>
        </div>
        <div className="log-list" ref={listRef}>
          {filteredLogs.length === 0 ? (
            <div className="log-empty">暂无日志</div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className={levelClass(log.level)}>
                <span className="log-time">{formatTime(log.timestamp)}</span>
                <span className="log-icon">{levelIcon(log.level)}</span>
                <span className="log-level">{log.level.toUpperCase()}</span>
                <span className="log-message" title={log.message}>
                  {log.message.length > 200 ? log.message.substring(0, 200) + '...' : log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
