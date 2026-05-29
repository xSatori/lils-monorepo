import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { discordApiPlugin } from './vite-plugin-discord-api.js'
import { ogImagesPlugin } from './vite-plugin-og-images.js'
import { rpcApiPlugin } from './vite-plugin-rpc-api.js'
import { lilCampApiPlugin } from './vite-plugin-lil-camp-api.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ponderGraphqlProxy = {
  target: 'https://graphql.lilnouns.wtf',
  changeOrigin: true,
  rewrite: () => '/',
}

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      ignoreConfigErrors: true, // Ignore errors in subgraph packages' tsconfig files
    }), // Handles path aliases from tsconfig
    discordApiPlugin(), // Handle Discord API proxy in dev
    ogImagesPlugin(), // Handle OG image API routes in dev
    rpcApiPlugin(), // Handle /api/rpc (Goldsky proxy) in dev
    lilCampApiPlugin(), // Handle Lil Camp candidate/topic API routes in dev
    // Inject process polyfill
    {
      name: 'inject-process-polyfill',
      transformIndexHtml(html) {
        return html.replace(
          '<head>',
          `<head>
    <script>
      // Polyfill process for browser - must be available globally before modules load
      (function() {
        if (typeof process === 'undefined') {
          var processPolyfill = {
            env: { NODE_ENV: 'production' },
            browser: true,
            version: 'v20.0.0'
          };
          window.process = processPolyfill;
          if (typeof globalThis !== 'undefined') {
            globalThis.process = processPolyfill;
          }
        }
      })();
    </script>`
        );
      },
    },
    // Remove fs imports from client bundle
    {
      name: 'remove-fs-imports',
      resolveId(id, importer) {
        // Intercept fs module resolution and return empty module
        if (id === 'fs' || id === 'node:fs' || id === 'node:fs/promises') {
          return '\0virtual:fs-stub';
        }
        return null;
      },
      load(id) {
        // Return empty module for fs stubs
        if (id === '\0virtual:fs-stub') {
          return 'export default {}; export const readFile = () => Promise.resolve(); export const writeFile = () => Promise.resolve(); export const readFileSync = () => ""; export const writeFileSync = () => {}; export const existsSync = () => false; export const mkdirSync = () => {}; export const statSync = () => ({ isFile: () => false, isDirectory: () => false });';
        }
        return null;
      },
      transform(code, id) {
        // Replace require("fs") calls in CommonJS modules
        if (id.includes('node_modules') && code.includes('require("fs")')) {
          return {
            code: code.replace(/require\(["']fs["']\)/g, '{}').replace(/require\(["']node:fs["']\)/g, '{}'),
            map: null,
          };
        }
        return null;
      },
      generateBundle(options, bundle) {
        Object.keys(bundle).forEach((fileName) => {
          const file = bundle[fileName];
          if (file.type === 'chunk' && file.code) {
            // Remove any remaining fs imports from final bundle
            file.code = file.code.replace(/import\s+.*?\s+from\s+["']fs["'];?/g, '');
            file.code = file.code.replace(/import\s+.*?\s+from\s+["']node:fs["'];?/g, '');
            file.code = file.code.replace(/import\s+.*?\s+from\s+["']node:fs\/promises["'];?/g, '');
            file.code = file.code.replace(/require\(["']fs["']\)/g, '{}');
            file.code = file.code.replace(/require\(["']node:fs["']\)/g, '{}');
          }
        });
      },
    },
  ],
  
  // Development server configuration optimized for Turborepo
  server: {
    port: 3000,
    host: '0.0.0.0', // Allow access via subdomain (sepolia.localhost)
    open: true,
    proxy: {
      '/api/ponder/graphql': ponderGraphqlProxy,
    },
    hmr: {
      port: 3000, // Use same port for HMR to avoid connection issues
      host: 'localhost', // HMR should connect via localhost
    },
    fs: {
      // Allow serving files from workspace packages
      allow: ['..', '../..'],
    },
  },

  preview: {
    proxy: {
      '/api/ponder/graphql': ponderGraphqlProxy,
    },
  },
  
  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      external: [
        // Server-only packages that shouldn't be bundled for client
        'sharp',
        'dotenv',
        'fs',
        'path',
        'os',
        'crypto',
        'node:util',
        'node:stream',
        'node:events',
        'node:os',
        'node:path',
        'node:fs',
        'node:fs/promises',
        'node:child_process',
        'node:crypto'
      ],
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-popover'],
          charts: ['recharts'],
          web3: ['viem', 'wagmi', '@rainbow-me/rainbowkit'],
          workspace: ['@nouns/types', '@repo/assets'],
        },
      },
    },
    // Increase chunk size limit for large workspace dependencies
    chunkSizeWarningLimit: 1000,
  },
  
  // Resolve configuration for monorepo
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@/ui': resolve(__dirname, '../../packages/ui/src'),
      '@/types': resolve(__dirname, '../../packages/types/src'),
      '@/database': resolve(__dirname, '../../packages/database/src'),
      '@/assets': resolve(__dirname, '../../packages/assets/src'),
      // Node.js polyfills for browser compatibility
      buffer: 'buffer',
      process: 'process/browser',
      util: 'util',
    },
    dedupe: ['react', 'react-dom'], // Prevent duplicate React instances
  },
  
  // Environment variables
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    'process.env': JSON.stringify({ NODE_ENV: process.env.NODE_ENV || 'production' }),
    'process.browser': 'true',
    'process.version': '"v20.0.0"',
    global: 'globalThis',
  },
  
  // Optimize dependencies for monorepo
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'vaul',
      'lucide-react', 
      'class-variance-authority',
      'buffer',
      'process/browser',
      'util',
    ],
    exclude: [
      // Exclude workspace packages from pre-bundling to enable proper HMR
      '@nouns/types',
      '@repo/assets',
      '@nouns/ui',
      // Exclude server-only packages
      'sharp',
      'dotenv',
    ],
    esbuildOptions: {
      // Replace fs imports with empty module during pre-bundling
      plugins: [
        {
          name: 'replace-fs',
          setup(build) {
            build.onResolve({ filter: /^(fs|node:fs|node:fs\/promises)$/ }, (args) => ({
              path: args.path,
              namespace: 'fs-stub',
            }));
            build.onLoad({ filter: /.*/, namespace: 'fs-stub' }, () => ({
              contents: 'export default {}; export const readFile = () => Promise.resolve(); export const writeFile = () => Promise.resolve(); export const readFileSync = () => ""; export const writeFileSync = () => {};',
              loader: 'js',
            }));
          },
        },
      ],
    },
    force: true, // Force optimization on workspace changes
  },
  
  // Workspace-specific configuration
  worker: {
    format: 'es', // Better tree shaking for workspace packages
  },
})
