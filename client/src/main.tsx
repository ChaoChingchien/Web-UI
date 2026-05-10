import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { api } from './api-client';
import './styles/global.css';

// 注入 API 客户端（与 Electron 模式下 window.api 接口一致）
declare global {
  interface Window {
    api: typeof api;
  }
}
window.api = api;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
