import React, { useState, useEffect } from 'react';
import type { Message } from '@shared/types';
import './SearchPanel.css';

interface SearchPanelProps {
  onSelectConversation: (conversationId: string) => void;
  onClose: () => void;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ onSelectConversation, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const r = await window.api.search(query.trim());
        setResults(r);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-panel" onClick={(e) => e.stopPropagation()}>
        <div className="search-header">
          <input
            className="search-input"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索对话内容..."
          />
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="search-body">
          {searching && <div className="search-status">搜索中...</div>}

          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <div className="search-status">无匹配结果</div>
          )}

          {results.map((msg) => (
            <div
              key={msg.id}
              className="search-result-item"
              onClick={() => { onSelectConversation(msg.conversation_id); onClose(); }}
            >
              <div className="result-role">{msg.role === 'user' ? '👤' : '🤖'}</div>
              <div className="result-content">
                <div className="result-text">{msg.content.substring(0, 200)}{msg.content.length > 200 ? '...' : ''}</div>
                <div className="result-meta">
                  {new Date(msg.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
