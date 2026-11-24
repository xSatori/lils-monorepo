import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { discordApiPlugin } from './vite-plugin-discord-api.js'
import { ogImagesPlugin } from './vite-plugin-og-images.js'
import { roundsUploadApiPlugin } from './vite-plugin-rounds-upload-api.js'
import { rpcApiPlugin } from './vite-plugin-rpc-api.js'

function readGit(command) {
  return execSync(command, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

// major.minor come from apps/web/package.json. The patch is the commit count,
// so each production deploy of new commits moves 1.0.80 → 1.0.81.
function getAppVersion() {
  if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  const [major = '1', minor = '0'] = String(pkg.version || '1.0.0').split('.')
  try {
    const shallow = readGit('git rev-parse --is-shallow-repository') === 'true'
    if (shallow && process.env.NETLIFY) {
      try {
        execSync('git fetch --unshallow', { stdio: 'ignore' })
      } catch {
        // Already complete, or the remote refused. Fall through to the shallow count.
      }
    }
    const patch = readGit('git rev-list --count HEAD') || '0'
    return `${major}.${minor}.${patch}`
  } catch {
    return `${major}.${minor}.0`
  }
}

const appVersion = getAppVersion()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      ignoreConfigErrors: true, // Ignore errors in subgraph packages' tsconfig files
    }), // Handles path aliases from tsconfig
    discordApiPlugin(), // Handle Discord API proxy in dev
    ogImagesPlugin(), // Handle OG image API routes in dev
    roundsUploadApiPlugin(),
    rpcApiPlugin(), // Handle /api/rpc (Goldsky proxy) in dev
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
    allowedHosts: ['localhost', 'sepolia.localhost', '.localhost'],
    open: false,
    hmr: {
      port: 3000, // Use same port for HMR to avoid connection issues
      host: 'localhost', // HMR should connect via localhost
    },
    fs: {
      // Allow serving files from workspace packages
      allow: ['..', '../..'],
    },
    proxy: {
      // Proposal editor image uploads (services/ipfs-upload on the VPS).
      // For a local service: IPFS_UPLOAD_PROXY_TARGET=http://127.0.0.1:3030/upload
      '/api/ipfs/upload': {
        target: new URL(process.env.IPFS_UPLOAD_PROXY_TARGET || 'https://db.lilnouns.wtf/api/ipfs/upload').origin,
        changeOrigin: true,
        rewrite: () => new URL(process.env.IPFS_UPLOAD_PROXY_TARGET || 'https://db.lilnouns.wtf/api/ipfs/upload').pathname,
      },
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
    __APP_VERSION__: JSON.stringify(appVersion),
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