# Nouns DAO Monorepo

This monorepo powers the latest LilNouns[dot]wtf site, newly using Turborepo and Bun workspaces. It provides applications, shared packages, and unified tooling for streamlined development.

## 🏗️ Monorepo Structure

### Applications

- **`apps/web`** – Vite + React frontend for users and governance (uses React Router)

### Shared Packages

- **`packages/ui`** – Reusable React UI libraries and components
- **`packages/config`** – Shared configuration (blockchain chains, contracts, app-wide settings)
- **`packages/types`** – Shared TypeScript types

### Tooling

- **`tooling/eslint-config`** – Unified ESLint config for all packages
- **`tooling/typescript-config`** – Shared `tsconfig.json` bases

---

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18
- Bun >= 1.1.34

### Setup

```bash
# Install all workspace dependencies
bun install

# Build every package and app
bun run build

# Start all apps for development
bun run dev
```

### Common Scripts

```bash
# Development: all apps
bun run dev

# Dev a specific app
bun run dev --filter=@nouns/web
bun run dev --filter=@nouns/cms
bun run dev --filter=@nouns/graphiql

# Build everything
bun run build

# Lint all code
bun run lint

# Type check everywhere
bun run type-check

# Remove build artifacts & outputs
bun run clean
```

---

## 🌐 Local URLs

- **Web**: http://localhost:3000
- **CMS**: http://localhost:3001
- **GraphiQL**: http://localhost:3002

---

## 📦 Workspace Management

We use [Bun workspaces](https://bun.sh/docs/install/workspaces) + [Turborepo](https://turbo.build) for orchestration, parallelization, and caching. Benefits include:

- **Smarter builds** via cache
- **Task ordering** based on dependency graphs
- **Parallel execution** of apps/packages
- **(Optional)** Remote cache sharing for faster CI

---

## 🔧 Environment Setup

1. Copy `.env.example` → `.env.local` in each application directory.
2. Fill in values as appropriate.

Example (root):

```
VITE_CHAIN_ID=1
VITE_ALCHEMY_API_KEY=your_key
VITE_INFURA_API_KEY=your_key
```

For production (Lil Nouns mainnet RPC via Goldsky): set **server-side only** (never use `VITE_` so it is not exposed to the client):

```
GOLDSKY_RPC_SECRET=your_goldsky_edge_secret
```

**Netlify deploy (apps/web):** In Site settings → Environment variables, add `GOLDSKY_RPC_SECRET`. `_redirects` sends `/api/rpc` to the `api-rpc` function. Ensure build has `VITE_ALCHEMY_API_KEY` and `VITE_INFURA_API_KEY` for RPC fallbacks.

---

### Adding Dependencies

```bash
# To an app:
bun add <package> --filter=@nouns/web

# To a package:
bun add <package> --filter=@nouns/ui

# For dev only, at root:
bun add <package> -d
```

---

## 🛠️ Build Process

Turborepo efficiently manages the build pipeline:

1. **Shared packages** build first (`packages/*`)
2. **Apps** build after dependencies (`apps/*`)
3. **Build outputs** cached automatically
4. **Tasks** run in parallel when possible

---

## 🧪 Testing

```bash
# All tests
bun run test

# Only in a specific app
bun run test --filter=@nouns/cms
```

---

## 📚 Package Layout

```
packages/[name]/
├── src/
│   └── index.ts
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

## ⚙️ Troubleshooting

### Frequent Issues

1. **Type issues**: `bun run type-check`
2. **Build errors**: `bun run clean` then `bun run build`
3. **Dependency mess**: Delete `node_modules` and retry `bun install`

### Tips

- Use `--filter` to narrow commands to a workspace
- Use Turborepo cache for speedy iterations
- Organize shared logic into the packages directory
- Stick to naming conventions throughout packages

---

## 📄 License
This project is licensed under the GNU General Public License v3.0 (GPL-3.0).

