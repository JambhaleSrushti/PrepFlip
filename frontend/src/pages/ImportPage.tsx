import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiError } from '../api'

export const SAMPLE_QUESTIONS = `1. Which organelle is known as the powerhouse of the cell?
(A) Nucleus
(B) Mitochondria
(C) Ribosome
(D) Golgi body
Answer: B

2. The SI unit of electric charge is
(1) Volt (2) Ampere (3) Coulomb (4) Ohm
Answer: 3

3. The chemical formula of sulphuric acid is
A) $\\ce{H2SO3}$
B) $\\ce{H2SO4}$
C) $\\ce{HSO4}$
D) $\\ce{H2S}$
Answer: B

4. Which of the following is a noble gas?
(A) Nitrogen
(B) Argon
(C) Oxygen`

export default function ImportPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [answerKey, setAnswerKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const set = await api.importText({ text, title: title.trim() || undefined, answer_key: answerKey.trim() || undefined })
      navigate(`/sets/${set.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <>
      <p>
        <Link to="/">← Your question sets</Link>
      </p>
      <h2>Add questions</h2>
      <form className="card" onSubmit={onSubmit}>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <label className="field">
          <span>Title (optional)</span>
          <input type="text" value={title} maxLength={200} placeholder="e.g. NEET 2023 Biology" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Questions</span>
          <textarea
            rows={14}
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'1. Question text\n(A) option\n(B) option\n(C) option\n(D) option\nAnswer: B'}
          />
        </label>
        <p className="muted">
          Number each question (<code>1.</code>, <code>Q1</code>) and label options <code>(A)</code>, <code>A)</code> or <code>(1)</code>.
          An <code>Answer: B</code> line is optional. Write maths as <code>$x^2$</code> and chemistry as <code>$\ce{'{H2O}'}$</code>.
        </p>
        <label className="field">
          <span>Answer key (optional)</span>
          <textarea
            rows={3}
            value={answerKey}
            onChange={(e) => setAnswerKey(e.target.value)}
            placeholder="e.g. 1-2, 2-3, 3-2  or  1.(2) 2.(3) 3.(2)"
          />
        </label>
        <p className="muted">Answers are matched by question number, so the key can be in any order.</p>
        <div className="row">
          <button type="button" onClick={() => setText(SAMPLE_QUESTIONS)}>
            Load sample
          </button>
          <button type="submit" className="primary" disabled={busy || !text.trim()}>
            {busy ? 'Converting…' : 'Convert to MCQs →'}
          </button>
        </div>
      </form>
      <p className="muted center">PDF upload is coming soon.</p>
    </>
  )
}
