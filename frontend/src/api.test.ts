import { describe, expect, it, vi } from 'vitest'
import { ApiError, request, setSessionEndedHandler } from './api'
import { fakeApi, json } from './test/fakeApi'

describe('request', () => {
  it('reports an ended session when a protected call returns 401', async () => {
    const ended = vi.fn()
    setSessionEndedHandler(ended)
    fakeApi({ 'GET /api/config': () => json({ detail: 'Please log in.' }, 401) })

    await expect(request('GET', '/config')).rejects.toMatchObject({ status: 401, message: 'Please log in.' })
    expect(ended).toHaveBeenCalledOnce()
  })

  it('does not treat a failed login as an ended session', async () => {
    const ended = vi.fn()
    setSessionEndedHandler(ended)
    fakeApi({ 'POST /api/auth/login': () => json({ detail: 'Wrong username or password.' }, 401) })

    await expect(request('POST', '/auth/login', {})).rejects.toBeInstanceOf(ApiError)
    expect(ended).not.toHaveBeenCalled()
  })

  it('sends JSON bodies with a JSON content type', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ok: true }))
    await request('POST', '/auth/login', { username: 'a' })
    const init = spy.mock.calls[0][1]!
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.body).toBe('{"username":"a"}')
  })

  it('gives a readable message when the error body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Bad gateway', { status: 502 }))
    await expect(request('GET', '/health')).rejects.toMatchObject({ message: 'Something went wrong (error 502).' })
  })
})
