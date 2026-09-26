import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthProvider } from './auth'
import { localAttempts, saveAttemptLocally, saveSetLocally } from './localStore'
import { fakeApi, json } from './test/fakeApi'
import { ASHA, attempt, ATTEMPT_ID, questionSet, SET_ID, submittedAttempt } from './test/fixtures'
import type { Attempt, QuestionSet } from './types'

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

const answered = attempt({ responses: { q1: { choice: 1, marked: false, visited: true } } })

/** A server that has just restarted: it knows the account but none of the student's data. */
function emptyServer() {
  const sets: Record<string, QuestionSet> = {}
  const attempts: Record<string, Attempt> = {}
  const bodies: Record<string, unknown> = {}
  const summary = (a: Attempt) => ({ id: a.id, status: a.status })
  const calls = fakeApi({
    'GET /api/auth/me': () => json(ASHA),
    'GET /api/sets': () => json(Object.values(sets).map((s) => ({ ...s, question_count: s.questions.length }))),
    'GET /api/attempts': () => json(Object.values(attempts).map(summary)),
    [`PUT /api/sets/${SET_ID}`]: (body) => {
      bodies.set = body
      sets[SET_ID] = { ...questionSet(), ...(body as Partial<QuestionSet>), updated_at: '2026-09-26T09:00:00Z' }
      return json(sets[SET_ID])
    },
    [`PUT /api/attempts/${ATTEMPT_ID}`]: (body) => {
      bodies.attempt = body
      // Like the real server, a submitted attempt is never reopened.
      if (attempts[ATTEMPT_ID]?.status !== 'submitted') attempts[ATTEMPT_ID] = { ...answered, ...(body as Partial<Attempt>) }
      return json(attempts[ATTEMPT_ID])
    },
    [`GET /api/attempts/${ATTEMPT_ID}`]: () => (attempts[ATTEMPT_ID] ? json(attempts[ATTEMPT_ID]) : json({ detail: 'Not found' }, 404)),
  })
  return { sets, attempts, bodies, calls }
}

describe('restoring after a server restart', () => {
  it('sends back the saved set and open attempt before showing the page', async () => {
    saveSetLocally(questionSet())
    saveAttemptLocally(answered)
    const server = emptyServer()
    renderAt(`/attempts/${ATTEMPT_ID}`)

    expect(await screen.findByText('1 of 3 answered')).toBeInTheDocument()
    expect(screen.getByText('Question 2 of 3')).toBeInTheDocument()
    expect(server.bodies.set).toMatchObject({ title: 'Biology mock 1', questions: [{ id: 'q1' }] })
    expect(server.bodies.attempt).toMatchObject({ set_id: SET_ID, order: ['q1', 'q2', 'q3'], responses: answered.responses })
    // The attempt was restored before the quiz asked for it.
    expect(server.calls.indexOf(`PUT /api/attempts/${ATTEMPT_ID}`)).toBeLessThan(server.calls.indexOf(`GET /api/attempts/${ATTEMPT_ID}`))
  })

  it("doesn't resend what the server still has, except open attempts", async () => {
    saveSetLocally(questionSet())
    saveAttemptLocally(answered)
    saveAttemptLocally({ ...submittedAttempt(), id: 'done-1' })
    const server = emptyServer()
    server.sets[SET_ID] = questionSet()
    server.attempts[ATTEMPT_ID] = attempt()
    server.attempts['done-1'] = { ...submittedAttempt(), id: 'done-1' }
    renderAt('/')

    await screen.findByRole('heading', { name: 'Welcome, Asha K' })
    expect(server.calls).not.toContain(`PUT /api/sets/${SET_ID}`)
    expect(server.calls).not.toContain('PUT /api/attempts/done-1')
    // The open attempt goes back so answers the server missed get there.
    expect(server.calls).toContain(`PUT /api/attempts/${ATTEMPT_ID}`)
  })

  it('keeps the local copy up to date with what the server returns', async () => {
    saveAttemptLocally(answered)
    const server = emptyServer()
    // Submitted on the server meanwhile (e.g. from another tab).
    server.attempts[ATTEMPT_ID] = submittedAttempt()
    renderAt('/')
    await screen.findByRole('heading', { name: 'Welcome, Asha K' })
    expect(localAttempts(ASHA.id)).toEqual([submittedAttempt()])
  })

  it('still opens the app if restoring fails', async () => {
    saveSetLocally(questionSet())
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fakeApi({
      'GET /api/auth/me': () => json(ASHA),
      'GET /api/sets': () => json([]),
      'GET /api/attempts': () => json([]),
      [`PUT /api/sets/${SET_ID}`]: () => json({ detail: 'Server error' }, 500),
    })
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Welcome, Asha K' })).toBeInTheDocument()
    expect(warn).toHaveBeenCalled()
  })
})
