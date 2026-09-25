import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth'
import { fakeApi, json } from '../test/fakeApi'
import { ASHA, attempt, ATTEMPT_ID, submittedAttempt } from '../test/fixtures'
import { timing } from '../timing'
import type { Attempt, QuestionResponse } from '../types'

const URL = `/api/attempts/${ATTEMPT_ID}`

beforeEach(() => {
  timing.responseSyncMs = 20
})

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

function fakeServer(initial: Attempt = attempt()) {
  let current = initial
  const saved: Record<string, QuestionResponse>[] = []
  const calls = fakeApi({
    'GET /api/auth/me': () => json(ASHA),
    [`GET ${URL}`]: () => json(current),
    [`PUT ${URL}/responses`]: (body) => {
      saved.push((body as { responses: Record<string, QuestionResponse> }).responses)
      return json(current)
    },
    [`POST ${URL}/submit`]: () => {
      current = submittedAttempt()
      return json(current)
    },
  })
  return { saved, calls }
}

const option = (name: RegExp) => screen.getByRole('button', { name })

describe('practice mode', () => {
  it('shows where the student is', async () => {
    fakeServer()
    renderAt(`/attempts/${ATTEMPT_ID}`)
    expect(await screen.findByText('Question 1 of 3')).toBeInTheDocument()
    expect(screen.getByText('0 of 3 answered')).toBeInTheDocument()
    expect(screen.getByText('Which organelle is the powerhouse of the cell?')).toBeInTheDocument()
  })

  it('gives instant feedback for a correct answer and saves it', async () => {
    const server = fakeServer()
    const user = userEvent.setup()
    renderAt(`/attempts/${ATTEMPT_ID}`)
    await user.click(await screen.findByRole('button', { name: /Mitochondria/ }))

    expect(screen.getByText('Correct!')).toBeInTheDocument()
    expect(screen.getByText('1 of 3 answered')).toBeInTheDocument()
    await waitFor(() => expect(server.saved.at(-1)?.q1).toEqual({ choice: 1, marked: false, visited: true }))
  })

  it('shows the right answer after a wrong one', async () => {
    fakeServer()
    const user = userEvent.setup()
    renderAt(`/attempts/${ATTEMPT_ID}`)
    await user.click(await screen.findByRole('button', { name: /Nucleus/ }))

    expect(screen.getByText('Not quite. The answer is B.')).toBeInTheDocument()
    expect(option(/Nucleus/)).toHaveClass('wrong')
    expect(option(/Mitochondria/)).toHaveClass('correct')
  })

  it('an answer cannot be changed once chosen', async () => {
    const server = fakeServer()
    const user = userEvent.setup()
    renderAt(`/attempts/${ATTEMPT_ID}`)
    await user.click(await screen.findByRole('button', { name: /Nucleus/ }))
    await user.click(option(/Mitochondria/))
    await user.keyboard('c')

    expect(option(/Nucleus/)).toHaveAttribute('aria-pressed', 'true')
    expect(option(/Mitochondria/)).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(server.saved.at(-1)?.q1.choice).toBe(0))
    // Saves before the click have no answer yet; after it, only ever the first choice.
    expect(server.saved.every((r) => r.q1.choice === null || r.q1.choice === 0)).toBe(true)
  })

  it('moves between questions with buttons, the palette and the keyboard', async () => {
    fakeServer()
    const user = userEvent.setup()
    renderAt(`/attempts/${ATTEMPT_ID}`)
    await user.click(await screen.findByRole('button', { name: /Mitochondria/ }))
    await user.click(screen.getByRole('button', { name: 'Next →' }))
    expect(screen.getByText('Question 2 of 3')).toBeInTheDocument()

    await user.keyboard('a') // answer Q2 with A (wrong)
    const palette = screen.getByRole('navigation', { name: 'Questions' })
    expect(within(palette).getByRole('button', { name: 'Question 1, correct' })).toBeInTheDocument()
    expect(within(palette).getByRole('button', { name: 'Question 2, wrong' })).toHaveAttribute('aria-current', 'step')
    expect(within(palette).getByRole('button', { name: 'Question 3, not visited' })).toBeInTheDocument()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('Question 3 of 3')).toBeInTheDocument()
    await user.click(within(palette).getByRole('button', { name: 'Question 1, correct' }))
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument()
    expect(within(palette).getByRole('button', { name: 'Question 3, not answered' })).toBeInTheDocument()
  })

  it('resumes at the first unanswered question', async () => {
    fakeServer(attempt({ responses: { q1: { choice: 1, marked: false, visited: true } } }))
    renderAt(`/attempts/${ATTEMPT_ID}`)
    expect(await screen.findByText('Question 2 of 3')).toBeInTheDocument()
    expect(screen.getByText('1 of 3 answered')).toBeInTheDocument()
  })

  it('submits after confirming unanswered questions and shows the result', async () => {
    const server = fakeServer()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderAt(`/attempts/${ATTEMPT_ID}`)
    await user.click(await screen.findByRole('button', { name: /Mitochondria/ }))
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(confirm).toHaveBeenCalledWith("You haven't answered 2 questions. Submit anyway?")
    expect(await screen.findByRole('heading', { name: 'Result: Biology mock 1' })).toBeInTheDocument()
    // Answers were saved before submitting.
    expect(server.saved.at(-1)?.q1.choice).toBe(1)
    const submitAt = server.calls.indexOf(`POST ${URL}/submit`)
    expect(server.calls.slice(0, submitAt)).toContain(`PUT ${URL}/responses`)
  })

  it('does not submit if the student cancels', async () => {
    const server = fakeServer()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    renderAt(`/attempts/${ATTEMPT_ID}`)
    await user.click(await screen.findByRole('button', { name: 'Submit' }))
    expect(server.calls).not.toContain(`POST ${URL}/submit`)
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument()
  })

  it('opens the result for an attempt that was already submitted', async () => {
    fakeServer(submittedAttempt())
    renderAt(`/attempts/${ATTEMPT_ID}`)
    expect(await screen.findByRole('heading', { name: 'Result: Biology mock 1' })).toBeInTheDocument()
  })

  it('renders LaTeX in questions and options', async () => {
    const a = attempt()
    a.questions[0] = { ...a.questions[0], text: 'Evaluate $\\frac{1}{2}$', options: ['$1$', '$0.5$'], answer_index: 1 }
    fakeServer(a)
    renderAt(`/attempts/${ATTEMPT_ID}`)
    const card = await screen.findByRole('region', { name: 'Question 1' })
    await waitFor(() => expect(card.querySelectorAll('.katex').length).toBe(3))
  })
})

describe('result page', () => {
  it('shows counts and the question-by-question review', async () => {
    fakeServer(submittedAttempt())
    renderAt(`/attempts/${ATTEMPT_ID}/result`)
    const summary = await screen.findByLabelText('Summary')
    expect(summary).toHaveTextContent('1 correct')
    expect(summary).toHaveTextContent('1 wrong')
    expect(summary).toHaveTextContent('1 skipped')
    expect(screen.getByText('50% of attempted questions correct.')).toBeInTheDocument()

    const q2 = screen.getByRole('article', { name: 'Question 2' })
    expect(within(q2).getByText('Wrong')).toBeInTheDocument()
    expect(within(q2).getByText('✗ Your answer').closest('li')).toHaveTextContent('Volt')
    expect(within(q2).getByText('✓ Correct answer').closest('li')).toHaveTextContent('Coulomb')
    expect(within(screen.getByRole('article', { name: 'Question 1' })).getByText('✓ Correct answer (yours)')).toBeInTheDocument()
  })

  it('filters to wrong or skipped questions', async () => {
    fakeServer(submittedAttempt())
    const user = userEvent.setup()
    renderAt(`/attempts/${ATTEMPT_ID}/result`)
    await screen.findByLabelText('Summary')
    const names = () => screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))

    expect(names()).toEqual(['Question 1', 'Question 2', 'Question 3'])
    await user.click(screen.getByRole('button', { name: 'Wrong (1)' }))
    expect(names()).toEqual(['Question 2'])
    await user.click(screen.getByRole('button', { name: 'Skipped (1)' }))
    expect(names()).toEqual(['Question 3'])
  })

  it('points back to the quiz if the attempt is not finished', async () => {
    fakeServer()
    renderAt(`/attempts/${ATTEMPT_ID}/result`)
    expect(await screen.findByRole('link', { name: 'Continue practising' })).toBeInTheDocument()
  })
})
