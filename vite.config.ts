import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {defineConfig} from 'vite';

function copyPublicFiltered(srcDir: string, destDir: string) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, {recursive: true});
  for (const entry of fs.readdirSync(srcDir, {withFileTypes: true})) {
    if (entry.name.toLowerCase() === 'desktop.ini') continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyPublicFiltered(srcPath, destPath);
    } else {
      fs.writeFileSync(destPath, fs.readFileSync(srcPath));
    }
  }
}

const rootDir = import.meta.dirname;

export default defineConfig(() => {
  return {
    base: './',
    cacheDir: path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'CubSpieleCom-vite-cache'),
    build: {
      copyPublicDir: false,
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'copy-public-no-desktop-ini',
        closeBundle() {
          copyPublicFiltered(path.resolve(rootDir, 'public'), path.resolve(rootDir, 'dist'));
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
