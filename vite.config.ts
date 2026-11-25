import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

/** Commit of this build: set by Cloudflare Workers Builds, else read from git (local builds). */
function commitSha(): string {
  const ci = process.env.WORKERS_CI_COMMIT_SHA;
  if (ci) return ci;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}
const sha = commitSha();

export default defineConfig({
  // Relative base so the build works from any static host or sub path.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(sha.slice(0, 7)),
    __APP_COMMIT__: JSON.stringify(sha),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'InBalans',
        short_name: 'InBalans',
        description: 'Eenvoudige boekhouding voor zzp',
        lang: 'nl',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f7f5f3',
        theme_color: '#9a4f68',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // The admin page lives on its own host and is never part of the offline app.
        globIgnores: ['admin.html', 'assets/admin-*'],
        // The API (and the sign-out link in e-mails) must never be answered from the app shell.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: { main: 'index.html', admin: 'admin.html' },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
  },
});
