import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import App from './App'

it('shows when the server is reachable', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"status":"ok"}'))
  render(<App />)
  expect(await screen.findByText('Server connected.')).toBeInTheDocument()
})

it('shows when the server is down', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
  render(<App />)
  expect(await screen.findByText('Cannot reach the server.')).toBeInTheDocument()
})
