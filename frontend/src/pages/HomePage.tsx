import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import type { SetSummary } from '../types'

export default function HomePage() {
  const { user } = useAuth()
  const [sets, setSets] = useState<SetSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listSets()
      .then(setSets)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your question sets.'))
  }, [])

  return (
    <>
      <div className="row heading-row">
        <h2>Welcome, {user?.display_name}</h2>
        <Link className="button primary" to="/import">
          + Add questions
        </Link>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {sets === null && !error && <p className="muted">Loading your question sets…</p>}
      {sets?.length === 0 && (
        <div className="card center">
          <p>You haven't added any questions yet.</p>
          <p className="muted">Paste questions from a paper to turn them into a practice quiz.</p>
        </div>
      )}
      {sets && sets.length > 0 && (
        <ul className="set-list" aria-label="Your question sets">
          {sets.map((s) => (
            <li key={s.id}>
              <Link to={`/sets/${s.id}`} className="card set-item">
                <strong>{s.title}</strong>
                <span className="muted">
                  {s.question_count} question{s.question_count === 1 ? '' : 's'} ·{' '}
                  {s.status === 'ready' ? (
                    <span className="badge ready">Ready</span>
                  ) : (
                    <span className="badge draft">{s.flagged_count} to check</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="muted center storage-note">Server storage is temporary during the pilot.</p>
    </>
  )
}
