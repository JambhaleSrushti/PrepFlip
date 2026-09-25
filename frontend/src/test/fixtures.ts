import type { Issue, Question, QuestionSet } from '../types'

export const ASHA = { id: 'user-asha', username: 'asha', display_name: 'Asha K' }
export const SET_ID = '11111111-2222-4333-8444-555555555555'

export function question(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    seq: 0,
    printed_number: 1,
    page: null,
    text: 'Which organelle is the powerhouse of the cell?',
    options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi body'],
    answer_index: 1,
    answer_source: 'paper_inline',
    answer_evidence: null,
    explanation: null,
    extraction_flags: [],
    acknowledged: [],
    issues: [],
    ...overrides,
  }
}

export const missingAnswer: Issue = {
  code: 'MISSING_ANSWER',
  message: 'Correct answer not found. Pick it, or paste the answer key.',
  blocking: true,
}
export const numberingGap: Issue = {
  code: 'NUMBERING_GAP',
  message: 'Q3 missing between Q2 and Q4. Was a question dropped?',
  blocking: false,
}

export function questionSet(overrides: Partial<QuestionSet> = {}): QuestionSet {
  return {
    id: SET_ID,
    owner_id: ASHA.id,
    title: 'Biology mock 1',
    status: 'ready',
    source: { kind: 'text', filename: null, page_count: null, sha256: null },
    questions: [question()],
    created_at: '2026-09-25T10:00:00Z',
    updated_at: '2026-09-25T10:00:00Z',
    ...overrides,
  }
}

/** A draft like the sample: two clean questions and Q4 with no answer and a numbering gap. */
export function flaggedSet(): QuestionSet {
  return questionSet({
    status: 'draft',
    questions: [
      question(),
      question({ id: 'q2', seq: 1, printed_number: 2, text: 'The SI unit of electric charge is', options: ['Volt', 'Ampere', 'Coulomb', 'Ohm'], answer_index: 2 }),
      question({
        id: 'q4', seq: 2, printed_number: 4, text: 'Which of the following is a noble gas?',
        options: ['Nitrogen', 'Argon', 'Oxygen'], answer_index: null, answer_source: null,
        issues: [missingAnswer, numberingGap],
      }),
    ],
  })
}
