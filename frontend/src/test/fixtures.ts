import type { Attempt, Issue, Question, QuestionSet } from '../types'

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

export const ATTEMPT_ID = '99999999-8888-4777-8666-555555555555'

/** A practice attempt over three questions: answers B, C, B. */
export function attempt(overrides: Partial<Attempt> = {}): Attempt {
  const qs = [
    question({ id: 'q1', printed_number: 1 }),
    question({ id: 'q2', seq: 1, printed_number: 2, text: 'The SI unit of electric charge is', options: ['Volt', 'Ampere', 'Coulomb', 'Ohm'], answer_index: 2 }),
    question({ id: 'q3', seq: 2, printed_number: 3, text: 'Which of the following is a noble gas?', options: ['Nitrogen', 'Argon', 'Oxygen'], answer_index: 1 }),
  ]
  return {
    id: ATTEMPT_ID,
    owner_id: ASHA.id,
    set_id: SET_ID,
    set_title: 'Biology mock 1',
    mode: 'practice',
    order_kind: 'original',
    questions: qs,
    order: ['q1', 'q2', 'q3'],
    marking: null,
    started_at: '2026-09-25T10:00:00Z',
    deadline_at: null,
    status: 'in_progress',
    responses: {},
    result: null,
    submitted_at: null,
    updated_at: '2026-09-25T10:00:00Z',
    ...overrides,
  }
}

/** The same attempt after submitting: Q1 right, Q2 wrong (chose A), Q3 skipped. */
export function submittedAttempt(): Attempt {
  return attempt({
    status: 'submitted',
    responses: { q1: { choice: 1, marked: false, visited: true }, q2: { choice: 0, marked: false, visited: true } },
    result: {
      correct: 1,
      wrong: 1,
      skipped: 1,
      score: null,
      max_score: null,
      per_question: [
        { question_id: 'q1', choice: 1, answer_index: 1, outcome: 'correct' },
        { question_id: 'q2', choice: 0, answer_index: 2, outcome: 'wrong' },
        { question_id: 'q3', choice: null, answer_index: 1, outcome: 'skipped' },
      ],
    },
  })
}
