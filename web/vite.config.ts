import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Guards against the exact mistake that broke production login this session:
  // `vite build` with no --mode loads Vite's built-in "production" env files
  // (.env.production[.local]), which this project doesn't use — it uses
  // .env.dev.local / .env.prod.local, loaded only via `--mode dev` / `--mode prod`
  // (see package.json's build:dev / build:prod). Run plain, every
  // VITE_FIREBASE_* var silently falls back to firebase.ts's placeholder
  // defaults and VITE_USE_EMULATORS defaults to "on" — producing a bundle
  // that looks built successfully but points at 127.0.0.1 for a real visitor.
  // Fail loudly here instead of shipping that.
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    if (!env.VITE_FIREBASE_PROJECT_ID || env.VITE_USE_EMULATORS !== 'false') {
      throw new Error(
        `Refusing to build in mode "${mode}": no real Firebase config loaded (VITE_FIREBASE_PROJECT_ID is unset, or VITE_USE_EMULATORS isn't "false").\n` +
          `Don't run "vite build" directly — use "npm run build:dev" or "npm run build:prod" from the repo root ` +
          `(they pass --mode dev / --mode prod, which load .env.dev.local / .env.prod.local).`
      );
    }
  }
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('firebase')) return 'firebase';
            if (id.includes('react-router') || id.includes('/react/') || id.includes('react-dom')) return 'react';
            return undefined;
          },
        },
      },
    },
  };
})
