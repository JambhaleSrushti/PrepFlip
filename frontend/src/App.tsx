import { useEffect, useState } from 'react'

type ApiStatus = 'checking' | 'ok' | 'down'

export default function App() {
  const [api, setApi] = useState<ApiStatus>('checking')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setApi(res.ok ? 'ok' : 'down'))
      .catch(() => setApi('down'))
  }, [])

  return (
    <>
      <header className="topbar">
        <h1>PrepFlip</h1>
        <span className="tag">NEET MCQ Practice</span>
      </header>
      <main>
        <div className="card center">
          <p>Practise NEET questions from your own papers.</p>
          <p className="muted" role="status">
            {api === 'checking' && 'Connecting to the server…'}
            {api === 'ok' && 'Server connected.'}
            {api === 'down' && 'Cannot reach the server.'}
          </p>
        </div>
      </main>
    </>
  )
}
