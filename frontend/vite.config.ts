import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// TASK 3.2: Bundle optimization for production
export default defineConfig({
  plugins: [react()],
  build: {
    // Enable code splitting
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'socket-vendor': ['socket.io-client'],
          'ui-vendor': ['@react-oauth/google'],
          'utils-vendor': ['axios', 'jwt-decode', 'dexie'],
        },
      },
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    // Enable source maps for production debugging (optional)
    sourcemap: false,
    // Minify with terser for better compression
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
      },
    },
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'socket.io-client'],
  },
})
