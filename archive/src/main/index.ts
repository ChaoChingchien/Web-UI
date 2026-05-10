import { app, BrowserWindow } from 'electron';
import path from 'path';
import log from 'electron-log';
import { DatabaseManager } from './database/DatabaseManager';
import { ProviderModel, RoleModel } from './database/models';
import { registerIpcHandlers } from './ipc-handlers';
import { createBuiltinProviders } from './providers/builtins';
import { createBuiltinRoles } from './providers/builtins/roles';
import { initLogCollector } from './logging/LogCollector';

log.initialize();
log.transports.file.level = 'info';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_VITE_NAME}/index.html`));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 初始化日志收集器
  initLogCollector(mainWindow);

  log.info('主窗口已创建');
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.whenReady().then(async () => {
  await DatabaseManager.getInstance().initialize();
  registerIpcHandlers();

  // 首次启动：初始化内置提供商
  if (ProviderModel.count() === 0) {
    const builtins = createBuiltinProviders();
    for (const provider of builtins) {
      ProviderModel.create(provider);
    }
    log.info(`已初始化 ${builtins.length} 个内置 AI 提供商`);
  }

  // 首次启动：初始化内置角色
  if (RoleModel.findAll().length === 0) {
    const roles = createBuiltinRoles();
    for (const role of roles) {
      RoleModel.create(role);
    }
    log.info(`已初始化 ${roles.length} 个内置 AI 角色`);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    // 关闭浏览器
    const { BrowserManager } = await import('./browser/BrowserManager');
    await BrowserManager.getInstance().close();
    DatabaseManager.getInstance().close();
    app.quit();
  }
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
