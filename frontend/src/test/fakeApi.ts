import { vi } from 'vitest'

type Handler = (body: unknown) => Response | Promise<Response>

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * Replaces fetch with a tiny fake API. Keys are "METHOD /api/path".
 * Unknown routes return 404 so a missing stub fails loudly.
 */
export function fakeApi(routes: Record<string, Handler>) {
  const calls: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const method = init?.method ?? 'GET'
    const key = `${method} ${String(input)}`
    calls.push(key)
    const handler = routes[key]
    if (!handler) return json({ detail: `No fake for ${key}` }, 404)
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    return handler(body)
  })
  return calls
}
