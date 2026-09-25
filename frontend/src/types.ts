// Mirrors the backend's pydantic models (backend/prepflip/models.py).

export type IssueCode =
  | 'EMPTY_QUESTION'
  | 'MISSING_ANSWER'
  | 'FEW_OPTIONS'
  | 'EMPTY_OPTION'
  | 'UNREADABLE_CHARS'
  | 'NEEDS_FIGURE'
  | 'AI_UNCERTAIN'
  | 'ANSWER_NO_EVIDENCE'
  | 'NUMBERING_GAP'
  | 'DUPLICATE_NUMBER'

export type Issue = {
  code: IssueCode
  message: string
  /** Blocking issues must be fixed; advisory ones need an "I've checked it". */
  blocking: boolean
}

export type Question = {
  id: string
  seq: number
  printed_number: number | null
  page: number | null
  text: string
  options: string[]
  answer_index: number | null
  answer_source: 'paper_inline' | 'paper_key' | 'student' | null
  answer_evidence: string | null
  explanation: string | null
  extraction_flags: { code: IssueCode; message: string }[]
  acknowledged: IssueCode[]
  issues: Issue[]
}

export type QuestionSet = {
  id: string
  owner_id: string
  title: string
  status: 'draft' | 'ready'
  source: { kind: 'pdf' | 'text'; filename: string | null; page_count: number | null; sha256: string | null }
  questions: Question[]
  created_at: string
  updated_at: string
}

export type SetSummary = {
  id: string
  title: string
  status: 'draft' | 'ready'
  question_count: number
  flagged_count: number
  source_kind: 'pdf' | 'text'
  updated_at: string
}

export type AnswerKeyResult = {
  set: QuestionSet
  applied: number
  unmatched: number[]
  ambiguous: number[]
  invalid: number[]
}

export const MAX_OPTIONS = 10

export function questionLabel(q: Pick<Question, 'printed_number' | 'seq'>): string {
  return q.printed_number !== null ? `Q${q.printed_number}` : `Question ${q.seq + 1}`
}

export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index)
}
