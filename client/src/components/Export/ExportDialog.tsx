import React, { useState } from 'react';
import type { ExportFormat } from '@shared/types';
import './ExportDialog.css';

interface ExportDialogProps {
  conversationId: string;
  onClose: () => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ conversationId, onClose }) => {
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      let result = '';
      if (format === 'markdown') result = await window.api.export.markdown(conversationId);
      else if (format === 'text') result = await window.api.export.text(conversationId);
      else if (format === 'json') result = await window.api.export.json(conversationId);
      setContent(result);
      showToast('导出成功');
    } catch (err) {
      showToast(`导出失败: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      showToast('已复制到剪贴板');
    } catch {
      showToast('复制失败');
    }
  };

  const handleSave = async () => {
    try {
      const ext = format === 'markdown' ? '.md' : format === 'json' ? '.json' : '.txt';
      const mime = format === 'json' ? 'application/json' : 'text/plain';
      const blob = new Blob([content], { type: `${mime};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversation${ext}`;
      a.click();
      // Delay revokeObjectURL to ensure browser finishes download
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('文件已保存');
    } catch {
      showToast('保存失败');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal export-dialog" style={{ width: 600, padding: 0 }} onClick={(e) => e.stopPropagation()}>
        <div className="export-header">
          <h3>导出对话</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="export-body" style={{ padding: 20 }}>
          <div className="format-selector">
            <label>格式：</label>
            <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
              <option value="markdown">Markdown (.md)</option>
              <option value="text">纯文本 (.txt)</option>
              <option value="json">JSON (.json)</option>
            </select>
            <button className="btn btn-primary btn-sm" onClick={handleExport} disabled={loading} style={{ marginLeft: 'auto' }}>
              {loading ? '生成中...' : '生成'}
            </button>
          </div>

          {content && (
            <>
              <pre className="export-preview">{content}</pre>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={handleCopy}>复制</button>
                <button className="btn btn-primary btn-sm" onClick={handleSave}>保存文件</button>
              </div>
            </>
          )}
        </div>

        {toast && (
          <div className="export-toast">{toast}</div>
        )}
      </div>
    </div>
  );
};
