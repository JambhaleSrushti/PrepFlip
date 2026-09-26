import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, ApiError } from '../api'
import QuestionEditor from '../components/QuestionEditor'
import StartPractice from '../components/StartPractice'
import { removeSetLocally, saveAttemptLocally, saveSetLocally } from '../localStore'
import { timing } from '../timing'
import type { IssueCode, Question, QuestionSet } from '../types'

type SaveState = 'saved' | 'pending' | 'saving' | 'error'

const SAVE_LABELS: Record<SaveState, string> = {
  saved: 'All changes saved',
  pending: 'Unsaved changes…',
  saving: 'Saving…',
  error: "Couldn't save. Retrying…",
}

function keyResultMessage(r: { applied: number; unmatched: number[]; ambiguous: number[]; invalid: number[] }): string {
  const parts = [`Filled in ${r.applied} answer${r.applied === 1 ? '' : 's'}.`]
  if (r.unmatched.length) parts.push(`No question numbered ${r.unmatched.join(', ')}.`)
  if (r.ambiguous.length) parts.push(`Skipped ${r.ambiguous.join(', ')}: that number appears in more than one section.`)
  if (r.invalid.length) parts.push(`Skipped ${r.invalid.join(', ')}: the key's answer isn't one of the options.`)
  return parts.join(' ')
}

export default function ReviewPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [set, setSet] = useState<QuestionSet | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [keyText, setKeyText] = useState('')
  const [keyMessage, setKeyMessage] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)

  // Latest local copy, and a counter bumped on every edit. A save only replaces the local copy
  // with the server's (fresh flags) if nothing was edited while it was in flight.
  const latest = useRef<QuestionSet | null>(null)
  const version = useRef(0)
  const savedVersion = useRef(0) // the last version the server has
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef(false) // an edit is waiting for the save timer
  // Saves run one after another, so an older save can never overwrite a newer one on the server.
  const queue = useRef<Promise<boolean>>(Promise.resolve(true))
  const retry = useRef<() => void>(() => {})

  useEffect(() => {
    api
      .getSet(id)
      .then((s) => {
        saveSetLocally(s)
        latest.current = s
        setSet(s)
      })
      .catch((err) => setLoadError(err instanceof ApiError && err.status === 404 ? 'This question set was not found.' : "Couldn't load this question set."))
  }, [id])

  const saveNow = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current)
    pending.current = false
    queue.current = queue.current.then(async () => {
      const snapshot = latest.current
      const sent = version.current
      if (!snapshot || sent === savedVersion.current) return true // nothing new to save
      setSaveState('saving')
      try {
        const saved = await api.saveSet(snapshot)
        saveSetLocally(saved)
        savedVersion.current = sent
        if (version.current === sent) {
          latest.current = saved
          setSet(saved)
          setSaveState('saved')
        }
        return true
      } catch {
        setSaveState('error')
        timer.current = setTimeout(() => retry.current(), timing.retryDelayMs)
        return false
      }
    })
    return queue.current
  }, [])

  useEffect(() => {
    retry.current = () => void saveNow()
  }, [saveNow])

  const edit = useCallback(
    (change: (s: QuestionSet) => QuestionSet) => {
      if (!latest.current) return
      latest.current = change(latest.current)
      version.current += 1
      setSet(latest.current)
      setSaveState('pending')
      pending.current = true
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void saveNow(), timing.saveDelayMs)
    },
    [saveNow],
  )

  // Leaving the page: save straight away instead of waiting for the timer.
  useEffect(
    () => () => {
      if (pending.current) void saveNow()
    },
    [saveNow],
  )

  useEffect(() => {
    if (saveState === 'saved') return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saveState])

  const updateQuestion = useCallback(
    (qid: string, patch: Partial<Question>) =>
      edit((s) => ({ ...s, questions: s.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)) })),
    [edit],
  )
  const removeQuestion = useCallback(
    (qid: string) => edit((s) => ({ ...s, questions: s.questions.filter((q) => q.id !== qid) })),
    [edit],
  )
  const acknowledge = useCallback(
    (qid: string, code: IssueCode) =>
      edit((s) => ({
        ...s,
        questions: s.questions.map((q) =>
          q.id === qid
            ? { ...q, acknowledged: [...q.acknowledged, code], issues: q.issues.filter((i) => i.code !== code) }
            : q,
        ),
      })),
    [edit],
  )

  if (loadError) {
    return (
      <div className="card center">
        <p role="alert">{loadError}</p>
        <Link to="/">Back to your question sets</Link>
      </div>
    )
  }
  if (!set) return <p className="muted">Loading…</p>

  const flagged = set.questions.filter((q) => q.issues.length > 0)
  const shown = onlyFlagged ? flagged : set.questions

  async function removeAllFlagged() {
    if (!window.confirm(`Remove ${flagged.length} flagged question${flagged.length === 1 ? '' : 's'}? This can't be undone.`)) return
    const ids = new Set(flagged.map((q) => q.id))
    edit((s) => ({ ...s, questions: s.questions.filter((q) => !ids.has(q.id)) }))
    setOnlyFlagged(false)
  }

  async function applyKey() {
    setKeyMessage(null)
    if (!(await saveNow())) return
    try {
      const result = await api.applyAnswerKey(id, keyText)
      saveSetLocally(result.set)
      latest.current = result.set
      setSet(result.set)
      setKeyMessage(keyResultMessage(result))
      setKeyText('')
    } catch (err) {
      setKeyMessage(err instanceof ApiError ? err.message : "Couldn't apply the answer key.")
    }
  }

  async function startPractice(order: 'original' | 'shuffle') {
    setStartError(null)
    if (!(await saveNow())) {
      setStartError("Couldn't save your changes. Check your connection and try again.")
      return
    }
    try {
      const attempt = await api.startAttempt({ set_id: id, mode: 'practice', order })
      saveAttemptLocally(attempt)
      navigate(`/attempts/${attempt.id}`)
    } catch (err) {
      setStartError(err instanceof ApiError ? err.message : "Couldn't start. Please try again.")
    }
  }

  async function deleteSet() {
    if (!window.confirm(`Delete "${set!.title}"? This can't be undone.`)) return
    clearTimeout(timer.current)
    pending.current = false
    await queue.current // let any save in flight finish first, so it can't re-create the set
    await api.deleteSet(id)
    removeSetLocally(set!.owner_id, id)
    navigate('/')
  }

  return (
    <>
      <p>
        <Link to="/">← Your question sets</Link>
      </p>
      <label className="field title-field">
        <span className="sr-only">Title</span>
        <input type="text" value={set.title} maxLength={200} onChange={(e) => edit((s) => ({ ...s, title: e.target.value }))} />
      </label>
      <p className="save-state muted" role="status">
        {SAVE_LABELS[saveState]}
      </p>

      <div className="card review-summary">
        <p>
          {set.questions.length} question{set.questions.length === 1 ? '' : 's'}.{' '}
          {flagged.length === 0
            ? 'Everything has been checked.'
            : `${flagged.length} need${flagged.length === 1 ? 's' : ''} your attention before you can practise.`}
        </p>
        {flagged.length > 0 && (
          <div className="row">
            <label className="inline">
              <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} /> Show only flagged (
              {flagged.length})
            </label>
            <button type="button" className="small" onClick={() => void removeAllFlagged()}>
              Remove all flagged
            </button>
          </div>
        )}
        <details className="answer-key">
          <summary>Paste an answer key</summary>
          <textarea
            rows={3}
            aria-label="Answer key"
            value={keyText}
            placeholder="e.g. 1-2, 2-3, 3-2  or  1.(2) 2.(3) 3.(2)"
            onChange={(e) => setKeyText(e.target.value)}
          />
          <button type="button" className="small" disabled={!keyText.trim()} onClick={() => void applyKey()}>
            Apply answer key
          </button>
        </details>
        {keyMessage && (
          <p className="notice" role="status">
            {keyMessage}
          </p>
        )}
      </div>

      {shown.map((q) => (
        <QuestionEditor key={q.id} question={q} onChange={updateQuestion} onRemove={removeQuestion} onAcknowledge={acknowledge} />
      ))}
      {set.questions.length === 0 && <p className="card center muted">No questions left in this set.</p>}

      <div className="card sticky-actions">
        {startError && (
          <p className="error" role="alert">
            {startError}
          </p>
        )}
        <StartPractice ready={set.status === 'ready' && flagged.length === 0} onStart={startPractice} />
        <div className="row delete-row">
          <button type="button" className="small danger" onClick={() => void deleteSet()}>
            Delete set
          </button>
        </div>
      </div>
    </>
  )
}
