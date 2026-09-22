import { Readable } from 'node:stream'

const INDEXER_URL = 'https://graphql.lilnouns.wtf'
const RETRY_AFTER_MS = 60_000
const MAX_REQUEST_BYTES = 1024 * 1024

export function createPonderGraphqlHandler({ fetchImpl = fetch, now = Date.now } = {}) {
  let unavailableUntil = 0
  let connecting = false

  return async function handlePonderGraphql(req, res) {
    if (now() < unavailableUntil || connecting) {
      req.resume()
      return unavailable(res)
    }

    connecting = true
    try {
      const chunks = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > MAX_REQUEST_BYTES) {
          connecting = false
          res.statusCode = 413
          return res.end('GraphQL request is too large.')
        }
        chunks.push(chunk)
      }

      const upstream = await fetchImpl(new URL(req.url || '/', INDEXER_URL), {
        method: req.method,
        headers: { 'content-type': req.headers['content-type'] || 'application/json' },
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
        signal: AbortSignal.timeout(15_000),
      })
      connecting = false
      res.statusCode = upstream.status
      for (const header of ['content-type', 'cache-control']) {
        const value = upstream.headers.get(header)
        if (value) res.setHeader(header, value)
      }
      if (upstream.body) {
        Readable.fromWeb(upstream.body).pipe(res)
      } else {
        res.end()
      }
    } catch (error) {
      connecting = false
      unavailableUntil = now() + RETRY_AFTER_MS
      const code = error?.cause?.code || error?.code || 'UPSTREAM_UNAVAILABLE'
      console.warn(`[ponder-graphql] upstream unavailable (${code}); retrying in 60 seconds`)
      unavailable(res)
    }
  }
}

function unavailable(res) {
  res.statusCode = 503
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Retry-After', '60')
  res.end(JSON.stringify({ errors: [{ message: 'Lil Nouns indexer is temporarily unavailable.' }] }))
}

export function ponderGraphqlApiPlugin() {
  const handler = createPonderGraphqlHandler()
  return {
    name: 'ponder-graphql-api',
    configureServer(server) {
      server.middlewares.use('/api/ponder/graphql', handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/ponder/graphql', handler)
    },
  }
}
