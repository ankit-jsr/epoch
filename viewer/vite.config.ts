import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// BASE_PATH is set by the deploy workflow to `/<repo-name>/`.
// Locally `npm run dev` it's just `/`.
const base = process.env.BASE_PATH ?? '/';

// In dev, manifest.json and screenshots/ live at the repo root (one level up).
// In a production build, the deploy workflow copies them into viewer/dist/ alongside the bundle.
// This plugin makes dev work without that copy step.
function serveRepoAssetsInDev(): Plugin {
  const repoRoot = resolve(__dirname, '..');
  return {
    name: 'serve-repo-assets-in-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const url = req.url.split('?')[0];
        const tryServe = (relPath: string, mime: string) => {
          const p = resolve(repoRoot, relPath);
          if (!existsSync(p)) return false;
          res.setHeader('Content-Type', mime);
          res.setHeader('Cache-Control', 'no-store');
          res.end(readFileSync(p));
          return true;
        };
        if (url === '/manifest.json') {
          if (tryServe('manifest.json', 'application/json')) return;
        }
        if (url.startsWith('/screenshots/')) {
          const rel = url.replace(/^\//, '');
          if (tryServe(rel, 'image/png')) return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), serveRepoAssetsInDev()],
  publicDir: false,
});
