import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { api, ApiError } from '../api'
import MathText from '../components/MathText'
import { saveAttemptLocally } from '../localStore'
import { timing } from '../timing'
import { optionLetter, questionLabel, type Attempt, type Question, type QuestionResponse } from '../types'

type SyncState = 'saved' | 'pending' | 'error'

const EMPTY: QuestionResponse = { choice: null, marked: false, visited: false }

function paletteState(q: Question, r: QuestionResponse | undefined): 'correct' | 'wrong' | 'seen' | 'unseen' {
  if (r?.choice != null) return r.choice === q.answer_index ? 'correct' : 'wrong'
  return r?.visited ? 'seen' : 'unseen'
}

const PALETTE_WORDS = { correct: 'correct', wrong: 'wrong', seen: 'not answered', unseen: 'not visited' }

export default function QuizPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [responses, setResponses] = useState<Record<string, QuestionResponse>>({})
  const [pos, setPos] = useState(0)
  const [syncState, setSyncState] = useState<SyncState>('saved')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Answers are shown and saved on this device straight away, and sent to the server every couple of seconds.
  const loaded = useRef<Attempt | null>(null)
  const latest = useRef<Record<string, QuestionResponse>>({})
  const dirty = useRef(false)
  const queue = useRef<Promise<boolean>>(Promise.resolve(true))

  useEffect(() => {
    api
      .getAttempt(id)
      .then((a) => {
        saveAttemptLocally(a)
        loaded.current = a
        latest.current = a.responses
        setResponses(a.responses)
        // Resume at the first question without an answer.
        const next = a.order.findIndex((qid) => a.responses[qid]?.choice == null)
        setPos(next === -1 ? 0 : next)
        setAttempt(a)
      })
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? 'This practice session was not found.' : "Couldn't load this practice session."))
  }, [id])

  const flush = useCallback((): Promise<boolean> => {
    queue.current = queue.current.then(async () => {
      if (!dirty.current) return true
      dirty.current = false
      try {
        await api.saveResponses(id, latest.current)
        if (!dirty.current) setSyncState('saved')
        return true
      } catch {
        dirty.current = true
        setSyncState('error')
        return false
      }
    })
    return queue.current
  }, [id])

  useEffect(() => {
    const timer = setInterval(() => void flush(), timing.responseSyncMs)
    return () => {
      clearInterval(timer)
      void flush() // leaving the page: send what's left
    }
  }, [flush])

  const update = useCallback((qid: string, patch: Partial<QuestionResponse>) => {
    latest.current = { ...latest.current, [qid]: { ...EMPTY, ...latest.current[qid], ...patch } }
    if (loaded.current) saveAttemptLocally({ ...loaded.current, responses: latest.current })
    dirty.current = true
    setResponses(latest.current)
    setSyncState((s) => (s === 'error' ? s : 'pending'))
  }, [])

  const questions = attempt ? Object.fromEntries(attempt.questions.map((q) => [q.id, q])) : {}
  const currentId = attempt?.order[pos]
  const current = currentId ? questions[currentId] : undefined
  const chosen = currentId ? (responses[currentId]?.choice ?? null) : null

  // Mark a question as visited when it is shown.
  useEffect(() => {
    if (currentId && !latest.current[currentId]?.visited) update(currentId, { visited: true })
  }, [currentId, update])

  const choose = useCallback(
    (index: number) => {
      if (!currentId || latest.current[currentId]?.choice != null) return // practice mode: first answer counts
      update(currentId, { choice: index, visited: true })
    },
    [currentId, update],
  )

  const count = attempt?.order.length ?? 0
  const go = useCallback((to: number) => setPos(Math.max(0, Math.min(count - 1, to))), [count])

  // Keyboard: ← → to move, A–D or 1–4 to answer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('input, textarea')) return
      if (e.key === 'ArrowRight') go(pos + 1)
      else if (e.key === 'ArrowLeft') go(pos - 1)
      else {
        const key = e.key.toUpperCase()
        const index = /^[A-J]$/.test(key) ? key.charCodeAt(0) - 65 : /^[1-9]$/.test(key) ? Number(key) - 1 : -1
        if (current && index >= 0 && index < current.options.length) choose(index)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pos, go, choose, current])

  if (error && !attempt) {
    return (
      <div className="card center">
        <p role="alert">{error}</p>
        <Link to="/">Back to your question sets</Link>
      </div>
    )
  }
  if (!attempt || !current) return <p className="muted">Loading…</p>
  if (attempt.status === 'submitted') return <Navigate to={`/attempts/${id}/result`} replace />

  const answered = attempt.order.filter((qid) => responses[qid]?.choice != null).length
  const isLast = pos === count - 1

  async function submit() {
    const unanswered = count - answered
    if (unanswered > 0 && !window.confirm(`You haven't answered ${unanswered} question${unanswered === 1 ? '' : 's'}. Submit anyway?`)) return
    setError(null)
    setSubmitting(true)
    if (!(await flush())) {
      setError("Couldn't save your answers. Check your connection and try again.")
      setSubmitting(false)
      return
    }
    try {
      saveAttemptLocally(await api.submitAttempt(id))
      navigate(`/attempts/${id}/result`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit. Please try again.")
      setSubmitting(false)
    }
  }

  return (
    <div className="quiz">
      <div className="quiz-head">
        <strong>
          Question {pos + 1} of {count}
        </strong>
        <span className="muted">
          {answered} of {count} answered
        </span>
        <button type="button" className="small" disabled={submitting} onClick={() => void submit()}>
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
      <div className="progress" role="progressbar" aria-label="Answered" aria-valuemin={0} aria-valuemax={count} aria-valuenow={answered}>
        <div style={{ width: `${(answered / count) * 100}%` }} />
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="card" aria-label={`Question ${pos + 1}`}>
        <p className="muted question-meta">
          {attempt.set_title} · {questionLabel(current)}
        </p>
        <MathText as="p" className="question" text={current.text} />
        <div className="options">
          {current.options.map((option, i) => {
            let state = ''
            if (chosen !== null && i === current.answer_index) state = ' correct'
            else if (chosen === i) state = ' wrong'
            return (
              <button
                type="button"
                key={i}
                className={`option${state}`}
                aria-disabled={chosen !== null}
                aria-pressed={chosen === i}
                onClick={() => choose(i)}
              >
                <span className="letter">{optionLetter(i)}</span>
                <MathText text={option} />
              </button>
            )
          })}
        </div>
        {chosen !== null && (
          <p className={`feedback ${chosen === current.answer_index ? 'correct' : 'wrong'}`} role="status">
            {chosen === current.answer_index ? 'Correct!' : `Not quite. The answer is ${optionLetter(current.answer_index!)}.`}
          </p>
        )}
        {chosen !== null && current.explanation && <MathText as="p" className="explanation" text={current.explanation} />}
      </section>

      <div className="row">
        <button type="button" disabled={pos === 0} onClick={() => go(pos - 1)}>
          ← Previous
        </button>
        {isLast ? (
          <button type="button" className="primary" disabled={submitting} onClick={() => void submit()}>
            Finish
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => go(pos + 1)}>
            Next →
          </button>
        )}
      </div>

      <nav className="palette" aria-label="Questions">
        {attempt.order.map((qid, i) => {
          const state = paletteState(questions[qid], responses[qid])
          return (
            <button
              type="button"
              key={qid}
              className={`pal ${state}`}
              aria-label={`Question ${i + 1}, ${PALETTE_WORDS[state]}`}
              aria-current={i === pos ? 'step' : undefined}
              onClick={() => go(i)}
            >
              {i + 1}
            </button>
          )
        })}
      </nav>
      <p className="muted sync-state" role="status">
        {syncState === 'saved' && 'Answers saved'}
        {syncState === 'pending' && 'Saving answers…'}
        {syncState === 'error' && "Answers saved on this device. Can't reach the server yet; we'll keep trying."}
      </p>
    </div>
  )
}
