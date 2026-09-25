import { memo } from 'react'
import { MAX_OPTIONS, optionLetter, questionLabel, type IssueCode, type Question } from '../types'
import MathText from './MathText'

type Props = {
  question: Question
  onChange: (id: string, patch: Partial<Question>) => void
  onRemove: (id: string) => void
  onAcknowledge: (id: string, code: IssueCode) => void
}

/** One question on the review screen: rendered preview, editable text and options, and its flags. */
function QuestionEditor({ question: q, onChange, onRemove, onAcknowledge }: Props) {
  const label = questionLabel(q)

  function setOption(index: number, value: string) {
    onChange(q.id, { options: q.options.map((o, i) => (i === index ? value : o)) })
  }

  function removeOption(index: number) {
    let answer = q.answer_index
    if (answer === index) answer = null
    else if (answer !== null && answer > index) answer -= 1
    onChange(q.id, {
      options: q.options.filter((_, i) => i !== index),
      answer_index: answer,
      ...(answer === null ? { answer_source: null, answer_evidence: null } : {}),
    })
  }

  return (
    <article className={`card question-editor${q.issues.length ? ' has-issues' : ''}`} aria-label={label}>
      <div className="review-head">
        <strong>
          {label}
          {q.page !== null && <span className="muted"> · page {q.page}</span>}
        </strong>
        <button type="button" className="small" onClick={() => onRemove(q.id)}>
          Remove question
        </button>
      </div>

      <div className="preview" aria-hidden="true">
        <MathText as="p" text={q.text} />
        <ol type="A">
          {q.options.map((o, i) => (
            <li key={i} className={i === q.answer_index ? 'is-answer' : undefined}>
              <MathText text={o} />
            </li>
          ))}
        </ol>
      </div>

      <label className="field">
        <span className="sr-only">{label} text</span>
        <textarea rows={2} value={q.text} onChange={(e) => onChange(q.id, { text: e.target.value })} />
      </label>

      <fieldset className="review-options">
        <legend className="sr-only">{label} options. Pick the correct answer.</legend>
        {q.options.map((option, i) => (
          <div className="review-option" key={i}>
            <input
              type="radio"
              name={`answer-${q.id}`}
              checked={q.answer_index === i}
              aria-label={`Option ${optionLetter(i)} is correct`}
              onChange={() => onChange(q.id, { answer_index: i, answer_source: 'student', answer_evidence: null })}
            />
            <span className="letter" aria-hidden="true">
              {optionLetter(i)}
            </span>
            <input type="text" aria-label={`Option ${optionLetter(i)}`} value={option} onChange={(e) => setOption(i, e.target.value)} />
            <button type="button" className="small" aria-label={`Remove option ${optionLetter(i)}`} onClick={() => removeOption(i)}>
              ✕
            </button>
          </div>
        ))}
        {q.options.length < MAX_OPTIONS && (
          <button type="button" className="small add-option" onClick={() => onChange(q.id, { options: [...q.options, ''] })}>
            + Add option
          </button>
        )}
      </fieldset>

      {q.answer_evidence && <p className="muted">Answer from: {q.answer_evidence}</p>}

      {q.issues.length > 0 && (
        <ul className="issues" aria-label={`${label} needs attention`}>
          {q.issues.map((issue) => (
            <li key={issue.code}>
              <span>⚠ {issue.message}</span>
              {!issue.blocking && (
                <button type="button" className="small" onClick={() => onAcknowledge(q.id, issue.code)}>
                  I've checked it
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

export default memo(QuestionEditor)
