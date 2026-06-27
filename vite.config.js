import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'PharmaPulse - KPI Management',
        short_name: 'PharmaPulse',
        description: 'نظام إدارة ومتابعة KPI الصيدليات',
        theme_color: '#1a9a7e',
        background_color: '#0f172a',
        display: 'standalone',
        // PR-1E5: explicit rather than implicit defaults — the app is used
        // on both phones (portrait) and tablets (landscape), so orientation
        // is intentionally left unlocked rather than forced to portrait.
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': '/src' } },
})
