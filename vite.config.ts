import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: {
    headers: Object.fromEntries(
      JSON.parse(
        readFileSync(path.resolve(__dirname, 'vercel.json'), 'utf8'),
      ).headers[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]),
    ),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'zustand'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-charts': ['recharts'],
          'vendor-ui': ['framer-motion', 'lucide-react'],
        },
      },
    },
  },
});
