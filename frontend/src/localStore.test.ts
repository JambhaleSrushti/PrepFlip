import { describe, expect, it, vi } from 'vitest'
import { hasLocalWork, localAttempts, localSets, MAX_RESULTS, removeSetLocally, saveAttemptLocally, saveSetLocally } from './localStore'
import { ASHA, attempt, questionSet, submittedAttempt } from './test/fixtures'

describe('local copies', () => {
  it('keeps sets per user and removes them', () => {
    saveSetLocally(questionSet())
    saveSetLocally(questionSet({ id: 'other', owner_id: 'user-ravi' }))
    expect(localSets(ASHA.id).map((s) => s.id)).toEqual([questionSet().id])
    expect(localSets('user-ravi').map((s) => s.id)).toEqual(['other'])

    removeSetLocally(ASHA.id, questionSet().id)
    expect(localSets(ASHA.id)).toEqual([])
    expect(hasLocalWork(ASHA.id)).toBe(false)
  })

  it('replaces an attempt with its newer copy', () => {
    saveAttemptLocally(attempt())
    saveAttemptLocally(attempt({ responses: { q1: { choice: 1, marked: false, visited: true } } }))
    expect(localAttempts(ASHA.id)).toHaveLength(1)
    expect(localAttempts(ASHA.id)[0].responses.q1.choice).toBe(1)
  })

  it(`keeps only the newest ${MAX_RESULTS} results, and every open attempt`, () => {
    saveAttemptLocally(attempt({ id: 'open' }))
    for (let i = 0; i < MAX_RESULTS + 3; i++) {
      const day = String(i + 1).padStart(2, '0')
      saveAttemptLocally({ ...submittedAttempt(), id: `done-${i}`, submitted_at: `2026-08-${day}T10:00:00Z` })
    }
    const ids = localAttempts(ASHA.id).map((a) => a.id)
    expect(ids).toContain('open')
    expect(ids).toHaveLength(MAX_RESULTS + 1)
    expect(ids).not.toContain('done-0')
    expect(ids).not.toContain('done-2')
    expect(ids).toContain('done-3')
  })

  it('carries on when storage is full or broken', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(() => saveSetLocally(questionSet())).not.toThrow()
    vi.restoreAllMocks()

    localStorage.setItem(`prepflip:v1:${ASHA.id}:sets`, '{not json')
    expect(localSets(ASHA.id)).toEqual([])
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(localAttempts(ASHA.id)).toEqual([])
  })
})
