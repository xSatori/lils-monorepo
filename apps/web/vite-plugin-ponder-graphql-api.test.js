import { describe, expect, it } from 'bun:test'
import { Readable } from 'node:stream'
import { createPonderGraphqlHandler } from './vite-plugin-ponder-graphql-api.js'

function request() {
  const req = Readable.from([Buffer.from('{"query":"{ __typename }"}')])
  req.method = 'POST'
  req.url = '/'
  req.headers = { 'content-type': 'application/json' }
  return req
}

function response() {
  const headers = {}
  return {
    headers,
    statusCode: 200,
    setHeader(name, value) { headers[name.toLowerCase()] = value },
    end(body = '') { this.body = String(body) },
  }
}

describe('local Ponder GraphQL proxy', () => {
  it('fails closed on upstream TLS errors and backs off repeated requests', async () => {
    let time = 0
    let calls = 0
    const handler = createPonderGraphqlHandler({
      now: () => time,
      fetchImpl: async () => {
        calls++
        throw Object.assign(new Error('fetch failed'), {
          cause: { code: 'CERT_HAS_EXPIRED' },
        })
      },
    })
    const first = response()
    await handler(request(), first)
    expect(first.statusCode).toBe(503)
    expect(first.headers['retry-after']).toBe('60')

    const second = response()
    await handler(request(), second)
    expect(second.statusCode).toBe(503)
    expect(calls).toBe(1)

    time = 60_001
    await handler(request(), response())
    expect(calls).toBe(2)
  })

  it('keeps TLS validation enabled when forwarding a healthy response', async () => {
    let target
    let options
    const handler = createPonderGraphqlHandler({
      fetchImpl: async (url, init) => {
        target = url
        options = init
        return { status: 200, headers: new Headers({ 'content-type': 'application/json' }), body: null }
      },
    })
    const res = response()
    await handler(request(), res)
    expect(res.statusCode).toBe(200)
    expect(target.href).toBe('https://graphql.lilnouns.wtf/')
    expect(options.dispatcher).toBeUndefined()
    expect(options.signal).toBeDefined()
  })

  it('allows only one upstream connection attempt at a time', async () => {
    let calls = 0
    let release
    const handler = createPonderGraphqlHandler({
      fetchImpl: async () => {
        calls++
        await new Promise((resolve) => { release = resolve })
        return { status: 200, headers: new Headers(), body: null }
      },
    })
    const first = response()
    const pending = handler(request(), first)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const second = response()
    await handler(request(), second)
    expect(second.statusCode).toBe(503)
    expect(calls).toBe(1)
    release()
    await pending
    expect(first.statusCode).toBe(200)
  })
})
