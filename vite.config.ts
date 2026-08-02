import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Base path must match the GitHub Pages repo name.
const BASE = process.env.BASE_PATH ?? '/car-share-app/';

export default defineConfig({
  base: BASE,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Quinta Car Share',
        short_name: 'Car Share',
        description: 'Reserve the car, log trips, track karma — Quinta Agave, August 2026.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F4F1ED',
        theme_color: '#F4F1ED',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the shell only. API traffic is handled by the outbox, never by
        // the service worker — a stale cached bootstrap would be worse than none.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: `${BASE}index.html`,
        runtimeCaching: [],
      },
    }),
  ],
  define: {
    __API_URL__: JSON.stringify(process.env.API_URL ?? ''),
    __APP_TOKEN__: JSON.stringify(process.env.APP_TOKEN ?? ''),
  },
});
