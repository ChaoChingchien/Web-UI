import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Message } from '@shared/types';

interface SearchResult extends Message {
  conversation_title?: string;
}
import './SearchPanel.css';

interface SearchPanelProps {
  onSelectConversation: (conversationId: string) => void;
  onClose: () => void;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ onSelectConversation, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced search with AbortController
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        setSelectedIndex(-1);
        return;
      }
      // Cancel previous in-flight request
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSearching(true);
      try {
        const r = await window.api.search(query.trim());
        if (!controller.signal.aborted) {
          setResults(r);
          setSelectedIndex(-1);
        }
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [query]);

  const highlightMatch = (text: string, term: string) => {
    if (!term) return text;
    try {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      const parts = text.substring(0, 200).split(regex);
      return parts.map((part, i) =>
        regex.test(part) ? <mark key={i} className="search-highlight">{part}</mark> : part
      );
    } catch {
      return text.substring(0, 200);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      onSelectConversation(results[selectedIndex].conversation_id);
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Reset when results change
  useEffect(() => { setSelectedIndex(-1); }, [results]);

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-panel" onClick={(e) => e.stopPropagation()}>
        <div className="search-header">
          <input
            ref={inputRef}
            className="search-input"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索对话内容... (↑↓ 导航, Enter 选择, Esc 关闭)"
          />
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="search-body">
          {searching && <div className="search-status">搜索中...</div>}

          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <div className="search-status">无匹配结果</div>
          )}

          {results.map((msg, i) => (
            <div
              key={msg.id}
              className={`search-result-item ${i === selectedIndex ? 'selected' : ''}`}
              onClick={() => { onSelectConversation(msg.conversation_id); onClose(); }}
            >
              <div className="result-role">{msg.role === 'user' ? '👤' : '🤖'}</div>
              <div className="result-content">
                <div className="result-text">{highlightMatch(msg.content, query.trim())}</div>
                <div className="result-meta">
                  {msg.conversation_title && (
                    <span className="result-conv-title">{msg.conversation_title}</span>
                  )}
                  {new Date(msg.created_at).toLocaleString()}
                  {msg.content.length > 200 && ' · 更多...'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
