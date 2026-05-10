import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';
import path from 'path';
import fs from 'fs-extra';

const NATIVE_MODULES = ['electron-log', 'sql.js', 'playwright-core', 'uuid'];

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'Web-AI',
    executableName: 'web-ai',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'web_ai',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      // The Vite plugin ignores all files except .vite/, so native Node.js
      // modules in dependencies are not copied. Manually copy them.
      for (const mod of NATIVE_MODULES) {
        const src = path.join(process.cwd(), 'node_modules', mod);
        const dest = path.join(buildPath, 'node_modules', mod);
        if (await fs.pathExists(src)) {
          await fs.copy(src, dest, { overwrite: true });
        }
      }
    },
  },
};

export default config;
