import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth'
import { fakeApi, json } from '../test/fakeApi'
import { ASHA, flaggedSet, SET_ID } from '../test/fixtures'
import { timing } from '../timing'
import type { QuestionSet } from '../types'

const SET_URL = `/api/sets/${SET_ID}`

beforeEach(() => {
  timing.saveDelayMs = 5
  timing.retryDelayMs = 20
})

function renderReview() {
  render(
    <MemoryRouter initialEntries={[`/sets/${SET_ID}`]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

/** A fake server that keeps the set and, like the real validator, clears Q4's flags once they're dealt with. */
function fakeServer(initial: QuestionSet = flaggedSet()) {
  let stored = initial
  const saves: QuestionSet[] = []
  const calls = fakeApi({
    'GET /api/auth/me': () => json(ASHA),
    [`GET ${SET_URL}`]: () => json(stored),
    [`PUT ${SET_URL}`]: (body) => {
      const sent = body as QuestionSet
      saves.push(sent)
      const questions = sent.questions.map((q) => ({
        ...q,
        issues: flaggedSet()
          .questions.find((f) => f.id === q.id)!
          .issues.filter((i) => (i.code === 'MISSING_ANSWER' ? q.answer_index === null : !q.acknowledged.includes(i.code))),
      }))
      stored = { ...stored, ...sent, questions, status: questions.every((q) => q.issues.length === 0) ? 'ready' : 'draft' }
      return json(stored)
    },
  })
  return { saves, calls, get stored() { return stored } }
}

describe('review screen', () => {
  it('shows the flags on each question and a summary', async () => {
    fakeServer()
    renderReview()
    const q4 = await screen.findByRole('article', { name: 'Q4' })
    expect(within(q4).getByText(/Correct answer not found/)).toBeInTheDocument()
    expect(within(q4).getByText(/Q3 missing between Q2 and Q4/)).toBeInTheDocument()
    expect(screen.getByText(/1 needs your attention/)).toBeInTheDocument()
  })

  it('fixing the flags saves the set and makes it ready', async () => {
    const server = fakeServer()
    const user = userEvent.setup()
    renderReview()
    const q4 = await screen.findByRole('article', { name: 'Q4' })

    await user.click(within(q4).getByRole('radio', { name: 'Option B is correct' }))
    await user.click(within(q4).getByRole('button', { name: "I've checked it" }))

    expect(await screen.findByText(/Everything has been checked/)).toBeInTheDocument()
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
    const lastQ4 = server.saves.at(-1)!.questions[2]
    expect(lastQ4).toMatchObject({ answer_index: 1, answer_source: 'student', acknowledged: ['NUMBERING_GAP'], issues: [] })
    expect(server.stored.status).toBe('ready')
  })

  it('advisory flags can be acknowledged but blocking ones cannot', async () => {
    fakeServer()
    renderReview()
    const q4 = await screen.findByRole('article', { name: 'Q4' })
    // One "I've checked it" button: for the numbering gap, not the missing answer.
    expect(within(q4).getAllByRole('button', { name: "I've checked it" })).toHaveLength(1)
  })

  it('"Show only flagged" hides questions with no flags', async () => {
    fakeServer()
    const user = userEvent.setup()
    renderReview()
    await screen.findByRole('article', { name: 'Q4' })
    expect(screen.getAllByRole('article')).toHaveLength(3)

    await user.click(screen.getByRole('checkbox', { name: /Show only flagged/ }))
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Q4'])
  })

  it('"Remove all flagged" removes them after confirming', async () => {
    const server = fakeServer()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderReview()
    await screen.findByRole('article', { name: 'Q4' })

    await user.click(screen.getByRole('button', { name: 'Remove all flagged' }))
    expect(confirm).toHaveBeenCalledWith("Remove 1 flagged question? This can't be undone.")
    await waitFor(() => expect(server.saves.at(-1)?.questions.map((q) => q.id)).toEqual(['q1', 'q2']))
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('editing an option is saved after a short pause', async () => {
    timing.saveDelayMs = 300 // long enough that typing a word counts as one edit
    const server = fakeServer()
    const user = userEvent.setup()
    renderReview()
    const q1 = await screen.findByRole('article', { name: 'Q1' })
    const optionC = within(q1).getByRole('textbox', { name: 'Option C' })
    await user.clear(optionC)
    await user.type(optionC, 'Ribosomes')

    await waitFor(() => expect(server.saves.at(-1)?.questions[0].options[2]).toBe('Ribosomes'))
    expect(server.saves).toHaveLength(1) // the whole word is saved once, not once per key
  })

  it('pasting an answer key fills answers and reports what was skipped', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /api/auth/me': () => json(ASHA),
      [`GET ${SET_URL}`]: () => json(flaggedSet()),
      [`PUT ${SET_URL}`]: (body) => json(body),
      [`POST ${SET_URL}/answer-key`]: (body) => {
        expect(body).toEqual({ text: '4-2 7-1' })
        const set = flaggedSet()
        set.questions[2] = { ...set.questions[2], answer_index: 1, answer_source: 'paper_key', answer_evidence: 'Pasted answer key: 4 (2)', issues: [] }
        return json({ set, applied: 1, unmatched: [7], ambiguous: [], invalid: [] })
      },
    })
    renderReview()
    await screen.findByRole('article', { name: 'Q4' })

    await user.click(screen.getByText('Paste an answer key'))
    await user.type(screen.getByRole('textbox', { name: 'Answer key' }), '4-2 7-1')
    await user.click(screen.getByRole('button', { name: 'Apply answer key' }))

    expect(await screen.findByText('Filled in 1 answer. No question numbered 7.')).toBeInTheDocument()
    expect(screen.getByText('Answer from: Pasted answer key: 4 (2)')).toBeInTheDocument()
  })

  it('keeps edits and retries when a save fails', async () => {
    // Typing finishes before the first save, and the error stays on screen until the retry.
    timing.saveDelayMs = 300
    timing.retryDelayMs = 300
    let fail = true
    const saves: QuestionSet[] = []
    fakeApi({
      'GET /api/auth/me': () => json(ASHA),
      [`GET ${SET_URL}`]: () => json(flaggedSet()),
      [`PUT ${SET_URL}`]: (body) => {
        if (fail) {
          fail = false
          return json({ detail: 'Server error' }, 500)
        }
        saves.push(body as QuestionSet)
        return json(body)
      },
    })
    const user = userEvent.setup()
    renderReview()
    const titleBox = await screen.findByDisplayValue('Biology mock 1')
    await user.type(titleBox, ' (fixed)')

    expect(await screen.findByText("Couldn't save. Retrying…")).toBeInTheDocument()
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
    expect(saves.at(-1)?.title).toBe('Biology mock 1 (fixed)')
  })

  it('renders LaTeX in the preview', async () => {
    const set = flaggedSet()
    set.questions[0] = { ...set.questions[0], text: 'Find $x^2$ when $x = 3$' }
    fakeServer(set)
    renderReview()
    const q1 = await screen.findByRole('article', { name: 'Q1' })
    await waitFor(() => expect(q1.querySelectorAll('.katex').length).toBe(2))
  })
})
