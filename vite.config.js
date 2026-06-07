import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: 'all',
    hmr: { host: false }  // <-- 加这一行
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icon.svg',
        'reference/sun-sphere.png',
        'whisper/*.jpg',
      ],
      manifest: {
        name: '日光盒子',
        short_name: '日光盒子',
        description: '焦虑移交仪式',
        theme_color: '#FFF8E7',
        background_color: '#FFF8E7',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,png,jpg,jpeg,webp,woff2}'],
      },
    }),
  ],
});
