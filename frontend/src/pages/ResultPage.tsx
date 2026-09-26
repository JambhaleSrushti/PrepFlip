import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, ApiError } from '../api'
import MathText from '../components/MathText'
import { saveAttemptLocally } from '../localStore'
import { optionLetter, type Attempt, type Outcome } from '../types'

type Filter = 'all' | Outcome

const OUTCOME_LABELS: Record<Outcome, string> = { correct: 'Correct', wrong: 'Wrong', skipped: 'Skipped' }

export default function ResultPage() {
  const { id = '' } = useParams()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    api
      .getAttempt(id)
      .then((a) => {
        if (a.status === 'submitted') saveAttemptLocally(a)
        setAttempt(a)
      })
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? 'This result was not found.' : "Couldn't load this result."))
  }, [id])

  if (error) {
    return (
      <div className="card center">
        <p role="alert">{error}</p>
        <Link to="/">Back to your question sets</Link>
      </div>
    )
  }
  if (!attempt) return <p className="muted">Loading…</p>
  if (!attempt.result) {
    return (
      <div className="card center">
        <p>This practice session hasn't been submitted yet.</p>
        <Link to={`/attempts/${id}`}>Continue practising</Link>
      </div>
    )
  }

  const { result } = attempt
  const questions = Object.fromEntries(attempt.questions.map((q) => [q.id, q]))
  const attempted = result.correct + result.wrong
  const accuracy = attempted ? Math.round((result.correct / attempted) * 100) : null
  const count = (f: Filter) => (f === 'all' ? result.per_question.length : result[f])
  const shown = result.per_question
    .map((p, position) => ({ ...p, position }))
    .filter((p) => filter === 'all' || p.outcome === filter)

  return (
    <>
      <p>
        <Link to="/">← Your question sets</Link>
      </p>
      <h2>Result: {attempt.set_title}</h2>

      <div className="stats" aria-label="Summary">
        <div className="stat correct">
          <strong>{result.correct}</strong> correct
        </div>
        <div className="stat wrong">
          <strong>{result.wrong}</strong> wrong
        </div>
        <div className="stat skipped">
          <strong>{result.skipped}</strong> skipped
        </div>
      </div>
      <p className="muted center">
        {accuracy === null ? 'No questions were attempted.' : `${accuracy}% of attempted questions correct.`}
      </p>

      <div className="row actions-row">
        <Link className="button" to={`/sets/${attempt.set_id}`}>
          Practise this set again
        </Link>
        <Link className="button primary" to="/">
          Done
        </Link>
      </div>

      <h3>Question by question</h3>
      <div className="filter-tabs" role="group" aria-label="Show">
        {(['all', 'wrong', 'skipped', 'correct'] as const).map((f) => (
          <button type="button" key={f} className="small" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : OUTCOME_LABELS[f]} ({count(f)})
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="muted">Nothing here.</p>}
      {shown.map((p) => {
        const q = questions[p.question_id]
        return (
          <article key={p.question_id} className={`card result-item ${p.outcome}`} aria-label={`Question ${p.position + 1}`}>
            <div className="review-head">
              <strong>Question {p.position + 1}</strong>
              <span className={`badge ${p.outcome}`}>{OUTCOME_LABELS[p.outcome]}</span>
            </div>
            <MathText as="p" className="question" text={q.text} />
            <ul className="result-options">
              {q.options.map((option, i) => {
                const isAnswer = i === p.answer_index
                const isChoice = i === p.choice
                return (
                  <li key={i} className={isAnswer ? 'is-answer' : isChoice ? 'is-wrong-choice' : undefined}>
                    <span className="letter">{optionLetter(i)}</span>
                    <MathText text={option} />
                    {isAnswer && <span className="tag-note">✓ Correct answer{isChoice ? ' (yours)' : ''}</span>}
                    {isChoice && !isAnswer && <span className="tag-note">✗ Your answer</span>}
                  </li>
                )
              })}
            </ul>
            {q.explanation && <MathText as="p" className="explanation" text={q.explanation} />}
          </article>
        )
      })}
    </>
  )
}
