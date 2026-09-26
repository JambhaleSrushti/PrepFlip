import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import type { AttemptSummary, SetSummary } from '../types'

const RECENT_RESULTS = 5

export default function HomePage() {
  const { user } = useAuth()
  const [sets, setSets] = useState<SetSummary[] | null>(null)
  const [attempts, setAttempts] = useState<AttemptSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listSets()
      .then(setSets)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your question sets.'))
    api
      .listAttempts()
      .then(setAttempts)
      .catch(() => {}) // the sets list is what matters; its error is shown above
  }, [])

  const inProgress = attempts.filter((a) => a.status === 'in_progress')
  const recent = attempts.filter((a) => a.status === 'submitted').slice(0, RECENT_RESULTS)

  return (
    <>
      <div className="row heading-row">
        <h2>Welcome, {user?.display_name}</h2>
        <Link className="button primary" to="/import">
          + Add questions
        </Link>
      </div>

      {inProgress.length > 0 && (
        <section aria-label="Continue practising">
          <h3>Continue practising</h3>
          <ul className="set-list">
            {inProgress.map((a) => (
              <li key={a.id}>
                <Link to={`/attempts/${a.id}`} className="card set-item">
                  <strong>{a.set_title}</strong>
                  <span className="muted">
                    {a.answered_count} of {a.question_count} answered · Resume →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h3>Your question sets</h3>
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

      {recent.length > 0 && (
        <section aria-label="Recent results">
          <h3>Recent results</h3>
          <ul className="set-list">
            {recent.map((a) => (
              <li key={a.id}>
                <Link to={`/attempts/${a.id}/result`} className="card set-item">
                  <strong>{a.set_title}</strong>
                  <span className="muted">
                    {a.correct} of {a.question_count} correct
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="muted center storage-note">Saved on this device. Server storage is temporary during the pilot.</p>
    </>
  )
}
