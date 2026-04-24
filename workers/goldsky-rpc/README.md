# Goldsky RPC (Cloudflare Worker)

Forwards `POST` JSON-RPC to [Goldsky Edge](https://edge.goldsky.com) for Ethereum mainnet (`/standard/evm/1`), appending `GOLDSKY_RPC_SECRET` on the server only.

## Prerequisites

- Cloudflare account
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (installed via this package’s devDependency; use `bunx wrangler`)

From **monorepo root** you can also run:

```bash
bun run deploy:goldsky-rpc
bun run dev:goldsky-rpc
```

Dashboard-only steps and a **prompt for Claude Code + browser** are in [CLOUDFLARE_HANDOFF.md](./CLOUDFLARE_HANDOFF.md).

## One-time setup

1. Authenticate (once per machine), or use `CLOUDFLARE_API_TOKEN` — see [CLOUDFLARE_HANDOFF.md](./CLOUDFLARE_HANDOFF.md).

   ```bash
   cd workers/goldsky-rpc
   bunx wrangler login
   ```

2. Deploy:

   ```bash
   bun run deploy
   ```

3. Set the Goldsky secret **in Cloudflare** (not in client env):

   ```bash
   bunx wrangler secret put GOLDSKY_RPC_SECRET
   ```

4. (Optional) Restrict CORS: in `wrangler.toml`, uncomment `[vars]` and set `ALLOWED_ORIGINS`, then redeploy.

5. (Optional) Custom domain: Workers & Pages → worker → Triggers → Custom Domains.

## Web app (Netlify / CI)

Set at **build** time:

```bash
VITE_RPC_PROXY_URL=https://<your-worker>.workers.dev
```

The site uses **proxy → Alchemy → Infura** for mainnet RPC when this is set.

## Local dev

```bash
cp .dev.vars.example .dev.vars
# edit .dev.vars
bun run dev
```

For day-to-day frontend dev you can instead use Vite’s `/api/rpc` with `GOLDSKY_RPC_SECRET` under `apps/web` (see repo root README).

## Scripts

| Command            | Action           |
|--------------------|------------------|
| `bun run dev`      | `wrangler dev`   |
| `bun run deploy`   | `wrangler deploy`|
| `bun run tail`     | Live logs        |
