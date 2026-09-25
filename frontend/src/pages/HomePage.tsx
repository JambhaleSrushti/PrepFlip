import { useAuth } from '../auth'

export default function HomePage() {
  const { user } = useAuth()
  return (
    <>
      <h2>Welcome, {user?.display_name}</h2>
      <div className="card">
        <p>Your question sets will appear here.</p>
        <p className="muted">Adding questions from a PDF or pasted text is coming next.</p>
      </div>
    </>
  )
}
