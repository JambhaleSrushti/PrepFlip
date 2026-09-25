import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthProvider } from './auth'
import { fakeApi, json } from './test/fakeApi'

const ASHA = { id: 'user-asha', username: 'asha', display_name: 'Asha K' }
const notLoggedIn = { 'GET /api/auth/me': () => json({ detail: 'Please log in.' }, 401) }

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

async function fillLogin(username: string, password: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Username'), username)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Log in' }))
  return user
}

describe('login', () => {
  it('redirects a logged-out visitor to the login page', async () => {
    fakeApi(notLoggedIn)
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it('shows the home page straight away when a session already exists', async () => {
    fakeApi({ 'GET /api/auth/me': () => json(ASHA) })
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Welcome, Asha K' })).toBeInTheDocument()
  })

  it('logs in and returns to the page the student asked for', async () => {
    fakeApi({
      ...notLoggedIn,
      'POST /api/auth/login': (body) => {
        expect(body).toEqual({ username: 'asha', password: 'asha-secret-1' })
        return json(ASHA)
      },
    })
    renderAt('/some/later/page')
    await fillLogin('asha', 'asha-secret-1')
    expect(await screen.findByText("That page doesn't exist.")).toBeInTheDocument()
    expect(screen.getByText('Asha K')).toBeInTheDocument()
  })

  it('shows the server message for a wrong password and clears the password', async () => {
    fakeApi({
      ...notLoggedIn,
      'POST /api/auth/login': () => json({ detail: 'Wrong username or password.' }, 401),
    })
    renderAt('/')
    await fillLogin('asha', 'wrong')
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Username')).toHaveValue('asha')
  })

  it('explains when too many attempts were made', async () => {
    fakeApi({
      ...notLoggedIn,
      'POST /api/auth/login': () => json({ detail: 'Too many failed logins. Please wait a few minutes and try again.' }, 429),
    })
    renderAt('/')
    await fillLogin('asha', 'wrong')
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many failed logins')
  })

  it('explains when the server cannot be reached', async () => {
    fakeApi(notLoggedIn)
    renderAt('/')
    await screen.findByLabelText('Username')
    // From now on every request fails at the network level.
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    await fillLogin('asha', 'asha-secret-1')
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
  })
})

describe('logout', () => {
  it('ends the session and shows the login page', async () => {
    const calls = fakeApi({
      'GET /api/auth/me': () => json(ASHA),
      'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    })
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(calls).toContain('POST /api/auth/logout')
  })
})
