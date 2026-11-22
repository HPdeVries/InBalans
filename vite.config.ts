import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so the build works from any static host or sub path.
  base: './',
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
        // The API (and the sign-out link in e-mails) must never be answered from the app shell.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
  },
});
