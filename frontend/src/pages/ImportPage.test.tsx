import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth'
import { fakeApi, json } from '../test/fakeApi'
import { ASHA, flaggedSet, SET_ID } from '../test/fixtures'

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('adding questions', () => {
  it('converts pasted text with an answer key and opens the review screen', async () => {
    fakeApi({
      'GET /api/auth/me': () => json(ASHA),
      'POST /api/imports/text': (body) => {
        expect(body).toEqual({ text: expect.stringContaining('powerhouse'), title: 'Bio 1', answer_key: '4-2' })
        return json(flaggedSet(), 201)
      },
      [`GET /api/sets/${SET_ID}`]: () => json(flaggedSet()),
    })
    const user = userEvent.setup()
    renderAt('/import')

    await user.type(await screen.findByLabelText('Title (optional)'), 'Bio 1')
    await user.click(screen.getByRole('button', { name: 'Load sample' }))
    await user.type(screen.getByLabelText('Answer key (optional)'), '4-2')
    await user.click(screen.getByRole('button', { name: 'Convert to MCQs →' }))

    expect(await screen.findByRole('article', { name: 'Q4' })).toBeInTheDocument()
  })

  it('shows why nothing was converted', async () => {
    fakeApi({
      'GET /api/auth/me': () => json(ASHA),
      'POST /api/imports/text': () => json({ detail: 'No questions found. Check the format and try again.' }, 422),
    })
    const user = userEvent.setup()
    renderAt('/import')
    await user.type(await screen.findByLabelText('Questions'), 'just some words')
    await user.click(screen.getByRole('button', { name: 'Convert to MCQs →' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No questions found')
  })
})

describe('home page', () => {
  it('lists question sets with their status', async () => {
    fakeApi({
      'GET /api/auth/me': () => json(ASHA),
      'GET /api/sets': () =>
        json([
          { id: 'a', title: 'Physics mock', status: 'ready', question_count: 45, flagged_count: 0, source_kind: 'text', updated_at: '' },
          { id: 'b', title: 'Chemistry mock', status: 'draft', question_count: 1, flagged_count: 1, source_kind: 'text', updated_at: '' },
        ]),
    })
    renderAt('/')
    const list = await screen.findByRole('list', { name: 'Your question sets' })
    expect(list).toHaveTextContent('Physics mock45 questions · Ready')
    expect(list).toHaveTextContent('Chemistry mock1 question · 1 to check')
  })

  it('invites the student to add questions when there are none', async () => {
    fakeApi({ 'GET /api/auth/me': () => json(ASHA), 'GET /api/sets': () => json([]) })
    renderAt('/')
    expect(await screen.findByText("You haven't added any questions yet.")).toBeInTheDocument()
  })
})
